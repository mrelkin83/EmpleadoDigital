import { logger, ProviderError } from '@empleado/shared';

/**
 * Conector oficial de Instagram (Graph API). Capa "SOCIAL CONNECTOR" del spec §86:
 * cliente puro de la API oficial — NO decide políticas; los skills deben pasar por
 * el SocialPolicyEngine antes de llamar aquí.
 *
 * Patrón adaptado de juancadile/instabot (cliente Graph API con retry) y ampliado
 * con el flujo de publicación en dos pasos (container → publish → verify, spec §42).
 */
const API_BASE = 'https://graph.instagram.com/v21.0';

export interface InstagramConnectorConfig {
  accessToken: string;
  businessAccountId: string;
}

export interface PublishResult {
  mediaId: string;
  permalink?: string;
}

export interface MediaInsights {
  mediaId: string;
  metrics: Record<string, number>;
}

export interface MediaComment {
  id: string;
  text?: string;
  timestamp?: string;
  from?: { id: string; username: string };
}

export class InstagramConnector {
  constructor(private readonly config: InstagramConnectorConfig) {}

  /** ID de la cuenta conectada (para distinguir comentarios propios en el polling). */
  get accountId(): string {
    return this.config.businessAccountId;
  }

  /**
   * Publica una imagen con caption. Flujo oficial de dos pasos:
   * 1) crear contenedor de media, 2) publicar el contenedor, 3) verificar.
   */
  async publishImage(imageUrl: string, caption: string): Promise<PublishResult> {
    const containerId = await this.createMediaContainer({ image_url: imageUrl, caption });
    await this.waitForContainer(containerId);
    const mediaId = await this.publishContainer(containerId);
    const permalink = await this.getPermalink(mediaId);
    logger.info({ mediaId }, 'Instagram: publicación verificada');
    return permalink ? { mediaId, permalink } : { mediaId };
  }

  /**
   * Publica un carrusel (2-10 imágenes): un contenedor hijo por lámina, luego
   * el contenedor CAROUSEL con los hijos, y publicación tras procesarse todo.
   */
  async publishCarousel(imageUrls: string[], caption: string): Promise<PublishResult> {
    if (imageUrls.length < 2 || imageUrls.length > 10) {
      throw new ProviderError('Un carrusel requiere entre 2 y 10 imágenes', {
        count: imageUrls.length,
      });
    }
    const children: string[] = [];
    for (const url of imageUrls) {
      const childId = await this.createMediaContainer({ image_url: url, is_carousel_item: 'true' });
      await this.waitForContainer(childId);
      children.push(childId);
    }
    const parentId = await this.createMediaContainer({
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption,
    });
    await this.waitForContainer(parentId);
    const mediaId = await this.publishContainer(parentId);
    const permalink = await this.getPermalink(mediaId);
    logger.info({ mediaId, slides: imageUrls.length }, 'Instagram: carrusel publicado y verificado');
    return permalink ? { mediaId, permalink } : { mediaId };
  }

  /**
   * Publica un video como Reel (único formato de video del feed vía API).
   * El procesamiento de video tarda más que el de imagen: timeout amplio.
   */
  async publishReel(videoUrl: string, caption: string): Promise<PublishResult> {
    const containerId = await this.createMediaContainer({
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
    });
    await this.waitForContainer(containerId, 5 * 60_000);
    const mediaId = await this.publishContainer(containerId);
    const permalink = await this.getPermalink(mediaId);
    logger.info({ mediaId }, 'Instagram: reel publicado y verificado');
    return permalink ? { mediaId, permalink } : { mediaId };
  }

  /**
   * Meta procesa el contenedor de forma asíncrona (descarga la imagen, la valida);
   * publicarlo antes de que esté FINISHED devuelve el error 9007 "Media ID is not
   * available". Se sondea status_code con backoff hasta FINISHED o timeout.
   */
  private async waitForContainer(containerId: string, timeoutMs = 90_000): Promise<void> {
    const start = Date.now();
    let delayMs = 2_000;
    for (;;) {
      const { status_code: status } = await this.get<{ status_code?: string }>(`/${containerId}`, {
        fields: 'status_code',
      });
      if (status === 'FINISHED') return;
      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new ProviderError(`Instagram: el contenedor de media terminó en estado ${status}`, {
          containerId,
          status,
        });
      }
      if (Date.now() - start > timeoutMs) {
        throw new ProviderError('Instagram: el contenedor de media no estuvo listo a tiempo', {
          containerId,
          status: status ?? 'desconocido',
        });
      }
      logger.info({ containerId, status }, 'Instagram: contenedor en proceso, esperando');
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 1.5, 10_000);
    }
  }

  private async createMediaContainer(params: Record<string, string>): Promise<string> {
    const data = await this.post<{ id: string }>(`/${this.config.businessAccountId}/media`, params);
    return data.id;
  }

  private async publishContainer(creationId: string): Promise<string> {
    const data = await this.post<{ id: string }>(`/${this.config.businessAccountId}/media_publish`, {
      creation_id: creationId,
    });
    return data.id;
  }

  /** Verificación post-publicación (spec §42: Publish → Verify → Record Result). */
  async getPermalink(mediaId: string): Promise<string | undefined> {
    try {
      const data = await this.get<{ permalink?: string }>(`/${mediaId}`, { fields: 'permalink' });
      return data.permalink;
    } catch {
      return undefined;
    }
  }

  /**
   * Suscribe la cuenta a los webhooks de la app. Requisito de Meta (Instagram Login):
   * sin esta llamada la app no recibe eventos de la cuenta aunque el webhook esté
   * verificado y los campos activados en el panel.
   */
  async subscribeToWebhooks(fields: string[]): Promise<{ success: boolean }> {
    return this.post<{ success: boolean }>(`/${this.config.businessAccountId}/subscribed_apps`, {
      subscribed_fields: fields.join(','),
    });
  }

  /** Métricas propias de una publicación (spec §23). */
  async getMediaInsights(mediaId: string, metrics: string[]): Promise<MediaInsights> {
    const data = await this.get<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
      `/${mediaId}/insights`,
      { metric: metrics.join(',') },
    );
    const result: Record<string, number> = {};
    for (const m of data.data) {
      result[m.name] = m.values[0]?.value ?? 0;
    }
    return { mediaId, metrics: result };
  }

  /** Publicaciones propias recientes. */
  async getOwnMedia(limit = 25): Promise<Array<{ id: string; caption?: string; timestamp: string }>> {
    const data = await this.get<{ data: Array<{ id: string; caption?: string; timestamp: string }> }>(
      `/${this.config.businessAccountId}/media`,
      { fields: 'id,caption,timestamp', limit: String(limit) },
    );
    return data.data;
  }

  /**
   * Comentarios de una publicación propia. Base del polling de comentarios: los
   * webhooks de comments no se entregan hasta publicar la app (App Review), así
   * que en desarrollo el Community Manager los lee por API.
   */
  async getMediaComments(mediaId: string, limit = 50): Promise<MediaComment[]> {
    const data = await this.get<{ data?: MediaComment[] }>(`/${mediaId}/comments`, {
      fields: 'id,text,timestamp,from',
      limit: String(limit),
    });
    return data.data ?? [];
  }

  /** Envía un DM de texto (solo debe invocarse tras un verdict 'allow' del Policy Engine). */
  async sendTextDM(recipientId: string, text: string): Promise<{ message_id?: string }> {
    return this.post<{ message_id?: string }>(`/me/messages`, undefined, {
      recipient: { id: recipientId },
      message: { text },
    });
  }

  /** Responde públicamente a un comentario. */
  async replyToComment(commentId: string, message: string): Promise<{ id: string }> {
    return this.post<{ id: string }>(`/${commentId}/replies`, { message });
  }

  // --- HTTP helpers con reintentos ---

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return this.request<T>(url.toString(), { method: 'GET' });
  }

  private async post<T>(
    path: string,
    form?: Record<string, string>,
    json?: unknown,
  ): Promise<T> {
    const init: RequestInit = { method: 'POST' };
    if (json !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(json);
    } else if (form) {
      const body = new URLSearchParams(form);
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      init.body = body.toString();
    }
    return this.request<T>(`${API_BASE}${path}`, init);
  }

  private async request<T>(url: string, init: RequestInit, attempt = 1): Promise<T> {
    const maxAttempts = 3;
    const response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${this.config.accessToken}` },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    // Reintento con backoff solo en errores transitorios; los rate limits de Meta
    // se respetan, nunca se evaden (spec §8).
    if ((response.status >= 500 || response.status === 429) && attempt < maxAttempts) {
      const delayMs = 500 * 2 ** attempt;
      logger.warn({ url: url.split('?')[0], status: response.status, attempt }, 'Instagram API: reintentando');
      await new Promise((r) => setTimeout(r, delayMs));
      return this.request<T>(url, init, attempt + 1);
    }

    const bodyText = await response.text().catch(() => '');
    throw new ProviderError(`Instagram API respondió ${response.status}`, {
      status: response.status,
      body: bodyText.slice(0, 500),
    });
  }
}
