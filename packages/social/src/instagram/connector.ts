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

export class InstagramConnector {
  constructor(private readonly config: InstagramConnectorConfig) {}

  /**
   * Publica una imagen con caption. Flujo oficial de dos pasos:
   * 1) crear contenedor de media, 2) publicar el contenedor, 3) verificar.
   */
  async publishImage(imageUrl: string, caption: string): Promise<PublishResult> {
    const containerId = await this.createMediaContainer({ image_url: imageUrl, caption });
    const mediaId = await this.publishContainer(containerId);
    const permalink = await this.getPermalink(mediaId);
    logger.info({ mediaId }, 'Instagram: publicación verificada');
    return permalink ? { mediaId, permalink } : { mediaId };
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
