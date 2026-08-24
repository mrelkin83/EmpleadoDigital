import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runQualityGate, canTransition } from '@empleado/content';
import { generateCaption, publishPost } from '@empleado/skills';
import { ApprovalRequiredError, PolicyViolationError } from '@empleado/shared';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';
import { UPLOADS_DIR } from '../server.js';
import { getEnv } from '../env.js';

const generateSchema = z.object({
  pillar: z.string().min(1).max(80),
  funnel: z.enum(['TOFU', 'MOFU', 'BOFU']),
  topic: z.string().min(3).max(200),
  format: z.enum(['reel', 'carousel', 'image', 'story', 'text']),
});

const publishSchema = z.object({
  // Opcional: si no se pasa, se usa el material subido a la pieza (POST :id/media).
  imageUrl: z.string().url().optional(),
  humanApproved: z.boolean().default(false),
});

/** Tipos de material aceptados. El video se guarda pero aún no se publica (reels: fase posterior). */
const MEDIA_TYPES: Record<string, { ext: string; kind: 'image' | 'video' }> = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
};

/** Origen público (túnel/dominio) desde el que Meta puede descargar /media/. */
function publicBaseUrl(): string | null {
  const uri = getEnv().OAUTH_REDIRECT_URI;
  return uri ? new URL(uri).origin : null;
}

const editSchema = z
  .object({
    hook: z.string().max(500),
    body: z.string().max(10000),
    cta: z.string().max(500),
    topic: z.string().min(3).max(200),
    pillar: z.string().min(1).max(80),
    funnel: z.enum(['TOFU', 'MOFU', 'BOFU']),
    format: z.enum(['reel', 'carousel', 'image', 'story', 'text']),
  })
  .partial()
  .strict();

/** Estados en los que una pieza es editable por el usuario. */
const EDITABLE_STATUSES = new Set(['idea', 'draft', 'in_review', 'rejected']);

export function registerContentRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/content', async () => {
    return ctx.store.listContent(DEFAULT_TENANT_ID);
  });

  /** Genera un borrador (draft) y ejecuta el Quality Gate como pre-diagnóstico. */
  app.post('/api/content/generate', async (request, reply) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });

    const rejectionFeedback = await ctx.store.listRecentRejectionReasons(DEFAULT_TENANT_ID);
    const piece = await generateCaption(ctx.router, {
      tenantId: DEFAULT_TENANT_ID,
      brand,
      ...parsed.data,
      ...(rejectionFeedback.length ? { rejectionFeedback } : {}),
    });
    await ctx.store.saveContent(piece);

    const recent = await ctx.store.listContent(DEFAULT_TENANT_ID);
    const gate = runQualityGate(piece, brand, {
      recentPieces: recent.filter((p) => p.id !== piece.id).slice(0, 20),
    });

    await ctx.logActivity({
      actor: 'copywriter',
      kind: 'action',
      summary: `Creé un borrador (${piece.format}, pilar "${piece.pillar}") sobre "${piece.topic}".`,
      explanation: {
        objective: `Contenido ${piece.funnel} del pilar ${piece.pillar}`,
        decision: `Generado con ${piece.generatedBy?.provider ?? 'IA'}`,
        expectedResult: 'Borrador listo para revisión',
      },
    });

    return reply.status(201).send({ piece, qualityGate: gate });
  });

  /**
   * Edita un borrador (corregir el copy, añadir el disclaimer, cambiar CTA...).
   * Una pieza rechazada vuelve a draft al editarse. Devuelve el Quality Gate actualizado.
   */
  app.patch('/api/content/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = editSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    if (!EDITABLE_STATUSES.has(piece.status)) {
      return reply.status(409).send({
        error: 'not_editable',
        message: `Una pieza en estado "${piece.status}" no puede editarse.`,
      });
    }
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });

    // El .partial() de zod incluye claves con valor undefined; se eliminan para no
    // sobreescribir campos existentes (exactOptionalPropertyTypes).
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Partial<typeof piece>;
    const updated = {
      ...piece,
      ...changes,
      status: piece.status === 'rejected' ? ('draft' as const) : piece.status,
      approval: 'pending' as const,
      updatedAt: new Date(),
    };
    await ctx.store.saveContent(updated);

    const gate = runQualityGate(updated, brand);
    return { piece: updated, qualityGate: gate };
  });

  /**
   * Sube el material (imagen o video) de una pieza. Reemplaza el anterior si existía.
   * El archivo queda en uploads/ y se sirve públicamente en /media/<filename> para
   * que la API de Instagram pueda descargarlo.
   */
  app.post('/api/content/:id/media', async (request, reply) => {
    const { id } = request.params as { id: string };
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    if (piece.status === 'published') {
      return reply.status(409).send({ error: 'media_locked', message: 'La pieza ya fue publicada.' });
    }

    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'file_missing' });
    const type = MEDIA_TYPES[file.mimetype];
    if (!type) {
      return reply.status(415).send({
        error: 'unsupported_media_type',
        message: `Tipo "${file.mimetype}" no soportado. Usa JPEG, PNG o MP4.`,
      });
    }

    const filename = `${randomUUID()}.${type.ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);
    await pipeline(file.file, createWriteStream(filePath));
    if (file.file.truncated) {
      await unlink(filePath).catch(() => {});
      return reply.status(413).send({ error: 'file_too_large', message: 'Máximo 100 MB.' });
    }

    const previous = piece.media?.filename;
    const updated = {
      ...piece,
      media: { filename, mime: file.mimetype, kind: type.kind },
      updatedAt: new Date(),
    };
    await ctx.store.saveContent(updated);
    if (previous && previous !== filename) {
      await unlink(path.join(UPLOADS_DIR, previous)).catch(() => {});
    }

    const base = publicBaseUrl();
    return reply.status(201).send({
      piece: updated,
      mediaUrl: base ? `${base}/media/${filename}` : `/media/${filename}`,
    });
  });

  /** Envía una pieza a revisión y crea la solicitud de aprobación (human-in-the-loop). */
  app.post('/api/content/:id/submit', async (request, reply) => {
    const { id } = request.params as { id: string };
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    if (!canTransition(piece.status, 'in_review')) {
      return reply.status(409).send({ error: 'invalid_transition', from: piece.status });
    }
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });

    const gate = runQualityGate(piece, brand);
    if (!gate.passed) {
      return reply.status(422).send({ error: 'quality_gate_failed', qualityGate: gate });
    }

    const updated = { ...piece, status: 'in_review' as const, updatedAt: new Date() };
    await ctx.store.saveContent(updated);
    await ctx.store.saveApproval({
      id: randomUUID(),
      tenantId: DEFAULT_TENANT_ID,
      kind: 'publish_content',
      resourceId: piece.id,
      summary: `Publicación pendiente: "${piece.hook || piece.topic}" (${piece.format}, ${piece.pillar})`,
      status: 'pending',
      createdAt: new Date(),
    });
    return { piece: updated, qualityGate: gate };
  });

  /**
   * Genera una VARIANTE de una pieza (Fase 4 — Variaciones): nuevo borrador con
   * el mismo tema pero ángulo y hook distintos, aprendiendo del feedback.
   */
  app.post('/api/content/:id/variant', async (request, reply) => {
    const { id } = request.params as { id: string };
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });

    const rejectionFeedback = await ctx.store.listRecentRejectionReasons(DEFAULT_TENANT_ID);
    const variant = await generateCaption(ctx.router, {
      tenantId: DEFAULT_TENANT_ID,
      brand,
      pillar: piece.pillar,
      funnel: piece.funnel,
      topic: piece.topic,
      format: piece.format,
      ...(piece.hook ? { avoidSimilarTo: piece.hook } : {}),
      ...(rejectionFeedback.length ? { rejectionFeedback } : {}),
    });
    await ctx.store.saveContent(variant);
    const gate = runQualityGate(variant, brand);
    await ctx.logActivity({
      actor: 'copywriter',
      kind: 'action',
      summary: `Creé una variante de "${piece.hook || piece.topic}" con otro ángulo.`,
    });
    return reply.status(201).send({ piece: variant, qualityGate: gate });
  });

  /**
   * Genera la imagen de marca de una pieza (plantilla determinista, sin coste).
   * Reemplaza el material anterior si existía.
   */
  app.post('/api/content/:id/media/generate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsedMode = z
      .object({ mode: z.enum(['ai', 'template']).optional() })
      .strict()
      .safeParse(request.body ?? {});
    if (!parsedMode.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsedMode.error.flatten() });
    }
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    if (piece.status === 'published') {
      return reply.status(409).send({ error: 'media_locked', message: 'La pieza ya fue publicada.' });
    }
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });

    const { generateBrandImage, generateAiImage } = await import('../pipeline/image-generator.js');
    const geminiKey = getEnv().GEMINI_API_KEY;
    const mode = parsedMode.data.mode ?? (geminiKey ? 'ai' : 'template');

    let generated;
    if (mode === 'ai' && geminiKey) {
      generated = await generateAiImage(geminiKey, brand, piece).catch(async (err) => {
        request.log.warn({ err }, 'Imagen IA falló; usando plantilla de marca');
        return generateBrandImage(brand, piece);
      });
    } else {
      generated = await generateBrandImage(brand, piece);
    }

    const previous = piece.media?.filename;
    const updated = {
      ...piece,
      media: { filename: generated.filename, mime: generated.mime, kind: 'image' as const },
      updatedAt: new Date(),
    };
    await ctx.store.saveContent(updated);
    if (previous && previous !== generated.filename) {
      await unlink(path.join(UPLOADS_DIR, previous)).catch(() => {});
    }

    const base = publicBaseUrl();
    return reply.status(201).send({
      piece: updated,
      mediaUrl: base ? `${base}/media/${generated.filename}` : `/media/${generated.filename}`,
    });
  });

  /**
   * Genera el carrusel completo: portada con IA + láminas de texto con plantilla
   * (una por punto del cuerpo). El material queda listo para publicarse como
   * carrusel real de Instagram.
   */
  app.post('/api/content/:id/media/generate-carousel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    if (piece.status === 'published') {
      return reply.status(409).send({ error: 'media_locked', message: 'La pieza ya fue publicada.' });
    }
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });

    const { generateCarousel } = await import('../pipeline/image-generator.js');
    try {
      const generated = await generateCarousel(getEnv().GEMINI_API_KEY, brand, piece);
      const previousFiles = [
        piece.media?.filename,
        ...(piece.media?.items?.map((i) => i.filename) ?? []),
      ].filter((f): f is string => Boolean(f));

      const updated = { ...piece, media: generated, updatedAt: new Date() };
      await ctx.store.saveContent(updated);
      const newFiles = new Set(generated.items.map((i) => i.filename));
      for (const f of previousFiles) {
        if (!newFiles.has(f)) await unlink(path.join(UPLOADS_DIR, f)).catch(() => {});
      }
      return reply.status(201).send({ piece: updated, slides: generated.items.length });
    } catch (err) {
      return reply.status(422).send({
        error: 'carousel_generation_failed',
        message: err instanceof Error ? err.message : 'error desconocido',
      });
    }
  });

  /**
   * Genera un video con Veo para la pieza (reels). Operación larga (1-5 min) y
   * de pago en Google: el dashboard avisa antes de invocarla.
   */
  app.post('/api/content/:id/media/generate-video', async (request, reply) => {
    const { id } = request.params as { id: string };
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    if (piece.status === 'published') {
      return reply.status(409).send({ error: 'media_locked', message: 'La pieza ya fue publicada.' });
    }
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });
    const geminiKey = getEnv().GEMINI_API_KEY;
    if (!geminiKey) {
      return reply.status(409).send({ error: 'gemini_key_missing', message: 'Configura GEMINI_API_KEY.' });
    }

    const { generateAiVideo } = await import('../pipeline/image-generator.js');
    try {
      const generated = await generateAiVideo(geminiKey, brand, piece);
      const previous = piece.media?.filename;
      const updated = {
        ...piece,
        media: { filename: generated.filename, mime: generated.mime, kind: generated.kind },
        updatedAt: new Date(),
      };
      await ctx.store.saveContent(updated);
      if (previous && previous !== generated.filename) {
        await unlink(path.join(UPLOADS_DIR, previous)).catch(() => {});
      }
      return reply.status(201).send({ piece: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'error desconocido';
      return reply.status(502).send({
        error: 'video_generation_failed',
        message: `${message}. Nota: Veo requiere plan de pago en Google AI Studio.`,
      });
    }
  });

  /**
   * Programa una pieza aprobada para publicación automática (spec §42: approved→scheduled).
   * Requiere material subido: a la hora programada no habrá humano para aportar la imagen.
   */
  app.post('/api/content/:id/schedule', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z
      .object({ scheduledAt: z.coerce.date() })
      .strict()
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    if (!canTransition(piece.status, 'scheduled')) {
      return reply.status(409).send({ error: 'invalid_transition', from: piece.status });
    }
    if (!piece.media) {
      return reply.status(400).send({
        error: 'media_missing',
        message: 'Sube el material (imagen o video) de la pieza antes de programarla.',
      });
    }
    if (parsed.data.scheduledAt.getTime() <= Date.now()) {
      return reply.status(400).send({ error: 'past_date', message: 'La fecha debe ser futura.' });
    }

    const updated = {
      ...piece,
      status: 'scheduled' as const,
      scheduledAt: parsed.data.scheduledAt,
      updatedAt: new Date(),
    };
    await ctx.store.saveContent(updated);
    await ctx.logActivity({
      actor: 'orquestador',
      kind: 'info',
      summary: `Programé "${piece.hook || piece.topic}" para ${parsed.data.scheduledAt.toLocaleString('es-CO')}.`,
    });
    return { piece: updated };
  });

  /** Cancela la programación: la pieza vuelve a 'approved' (transición del spec §42). */
  app.post('/api/content/:id/unschedule', async (request, reply) => {
    const { id } = request.params as { id: string };
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    if (piece.status !== 'scheduled') {
      return reply.status(409).send({ error: 'not_scheduled', from: piece.status });
    }
    const rest = { ...piece };
    delete rest.scheduledAt;
    const updated = { ...rest, status: 'approved' as const, updatedAt: new Date() };
    await ctx.store.saveContent(updated);
    await ctx.logActivity({
      actor: 'orquestador',
      kind: 'info',
      summary: `Cancelé la programación de "${piece.hook || piece.topic}".`,
    });
    return { piece: updated };
  });

  /** Publica una pieza aprobada vía skill publish_post (Quality Gate + Policy Engine + API oficial). */
  app.post('/api/content/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = publishSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, id);
    if (!piece) return reply.status(404).send({ error: 'not_found' });
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });
    if (!ctx.instagram) {
      return reply.status(409).send({
        error: 'instagram_not_connected',
        message: 'Conecta la cuenta de Instagram (variables INSTAGRAM_*) antes de publicar.',
      });
    }

    // Material: la URL explícita tiene prioridad; si no, el material subido a la pieza.
    // El video se publica como Reel.
    let media: { url: string; kind: 'image' | 'video' | 'carousel'; urls?: string[] } | undefined = parsed.data.imageUrl
      ? { url: parsed.data.imageUrl, kind: 'image' }
      : undefined;
    if (!media) {
      if (!piece.media) {
        return reply.status(400).send({
          error: 'media_missing',
          message: 'Sube el material de la pieza (POST /api/content/:id/media) o pasa imageUrl.',
        });
      }
      const base = publicBaseUrl();
      if (!base) {
        return reply.status(409).send({
          error: 'public_url_missing',
          message: 'Configura OAUTH_REDIRECT_URI (túnel/dominio) para servir el material a Meta.',
        });
      }
      media = {
        url: `${base}/media/${piece.media.filename}`,
        kind: piece.media.kind,
        ...(piece.media.kind === 'carousel' && piece.media.items
          ? { urls: piece.media.items.map((i) => `${base}/media/${i.filename}`) }
          : {}),
      };
    }

    try {
      const result = await publishPost(ctx.instagram, ctx.policyEngine, {
        piece,
        brand,
        media,
        humanApproved: parsed.data.humanApproved,
        policyContext: {
          tenantId: DEFAULT_TENANT_ID,
          grantedScopes: ctx.grantedScopes,
          autonomy: ctx.autonomy,
        },
      });
      await ctx.store.saveContent(result.piece);
      await ctx.logActivity({
        actor: 'orquestador',
        kind: 'action',
        summary: `Publiqué "${piece.hook || piece.topic}" en Instagram.`,
      });
      return result;
    } catch (err) {
      if (err instanceof ApprovalRequiredError) {
        return reply.status(403).send({ error: err.code, message: err.message });
      }
      if (err instanceof PolicyViolationError) {
        return reply.status(422).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
}
