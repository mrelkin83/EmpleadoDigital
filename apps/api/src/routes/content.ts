import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runQualityGate, canTransition } from '@empleado/content';
import { generateCaption, publishPost } from '@empleado/skills';
import { ApprovalRequiredError, PolicyViolationError } from '@empleado/shared';
import { randomUUID } from 'node:crypto';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

const generateSchema = z.object({
  pillar: z.string().min(1),
  funnel: z.enum(['TOFU', 'MOFU', 'BOFU']),
  topic: z.string().min(3),
  format: z.enum(['reel', 'carousel', 'image', 'story', 'text']),
});

const publishSchema = z.object({
  imageUrl: z.string().url(),
  humanApproved: z.boolean().default(false),
});

const editSchema = z
  .object({
    hook: z.string(),
    body: z.string(),
    cta: z.string(),
    topic: z.string().min(3),
    pillar: z.string().min(1),
    funnel: z.enum(['TOFU', 'MOFU', 'BOFU']),
    format: z.enum(['reel', 'carousel', 'image', 'story', 'text']),
  })
  .partial();

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

    const piece = await generateCaption(ctx.router, {
      tenantId: DEFAULT_TENANT_ID,
      brand,
      ...parsed.data,
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

    try {
      const result = await publishPost(ctx.instagram, ctx.policyEngine, {
        piece,
        brand,
        imageUrl: parsed.data.imageUrl,
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
