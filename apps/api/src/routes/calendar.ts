import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runQualityGate, validateWeeklyMix } from '@empleado/content';
import { generateCaption, planWeek } from '@empleado/skills';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

const planSchema = z.object({
  /** Lunes de la semana (YYYY-MM-DD). Por defecto: el próximo lunes. */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  defaultTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const slotEditSchema = z
  .object({
    topic: z.string().min(3).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    status: z.enum(['planned', 'skipped']),
  })
  .partial();

/** Un tema está definido cuando un humano o la IA lo concretó (no es el placeholder). */
function topicIsDefined(topic: string): boolean {
  return !topic.startsWith('Por definir');
}

export function registerCalendarRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/calendar', async (request) => {
    const { from } = request.query as { from?: string };
    const slots = await ctx.store.listCalendar(DEFAULT_TENANT_ID, from);
    return { slots, mix: validateWeeklyMix(slots) };
  });

  /** Planifica una semana (skill generate_content_calendar). Idempotencia simple: no duplica fechas ya planificadas. */
  app.post('/api/calendar/plan-week', async (request, reply) => {
    const parsed = planSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });

    const weekStart = parsed.data.weekStart ?? nextMonday();
    const existing = await ctx.store.listCalendar(DEFAULT_TENANT_ID, weekStart);
    const weekDates = new Set(existing.map((s) => s.date));

    const slots = await planWeek(ctx.router, {
      tenantId: DEFAULT_TENANT_ID,
      brand,
      weekStart,
      ...(parsed.data.defaultTime ? { defaultTime: parsed.data.defaultTime } : {}),
    });

    const created = [];
    for (const slot of slots) {
      if (weekDates.has(slot.date)) continue; // ya hay plan para ese día
      await ctx.store.saveCalendarSlot(slot);
      created.push(slot);
    }

    await ctx.logActivity({
      actor: 'content_planner',
      kind: 'action',
      summary: `Planifiqué la semana del ${weekStart}: ${created.length} publicaciones (${created.filter((s) => s.funnel === 'TOFU').length} descubrimiento, ${created.filter((s) => s.funnel === 'MOFU').length} confianza, ${created.filter((s) => s.funnel === 'BOFU').length} conversión).`,
      explanation: {
        objective: 'Publicar con intención siguiendo los pilares de la marca',
        decision: 'Distribución mayoritaria TOFU/MOFU para no saturar de contenido comercial',
        expectedResult: 'Calendario listo para generar y aprobar contenido',
      },
    });

    return reply.status(201).send({ weekStart, created, skipped: slots.length - created.length });
  });

  /** Edita un slot: definir el tema (los "Por definir"), mover fecha/hora u omitirlo. */
  app.patch('/api/calendar/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = slotEditSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const slots = await ctx.store.listCalendar(DEFAULT_TENANT_ID);
    const slot = slots.find((s) => s.id === id);
    if (!slot) return reply.status(404).send({ error: 'not_found' });
    if (slot.status === 'published') {
      return reply.status(409).send({ error: 'not_editable', message: 'El slot ya fue publicado.' });
    }
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Partial<typeof slot>;
    const updated = { ...slot, ...changes };
    await ctx.store.saveCalendarSlot(updated);
    return updated;
  });

  /**
   * Orquestador (Fase 2, primer tramo): genera borradores para los slots planificados
   * con tema definido y los deja en la cola de revisión. Los "Por definir" se omiten
   * y se reportan — el sistema pide el dato, no lo inventa (spec §57, §63).
   */
  app.post('/api/calendar/generate-drafts', async (request, reply) => {
    const { weekStart } = (request.body ?? {}) as { weekStart?: string };
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return reply.status(409).send({ error: 'brand_memory_missing' });

    const all = await ctx.store.listCalendar(DEFAULT_TENANT_ID, weekStart);
    const candidates = all.filter((s) => s.status === 'planned');
    const ready = candidates.filter((s) => topicIsDefined(s.topic));
    const undefinedTopics = candidates.filter((s) => !topicIsDefined(s.topic));

    const results = [];
    const rejectionFeedback = await ctx.store.listRecentRejectionReasons(DEFAULT_TENANT_ID);
    for (const slot of ready) {
      const piece = await generateCaption(ctx.router, {
        tenantId: DEFAULT_TENANT_ID,
        brand,
        pillar: slot.pillar,
        funnel: slot.funnel,
        topic: slot.topic,
        format: slot.format,
        ...(rejectionFeedback.length ? { rejectionFeedback } : {}),
      });
      await ctx.store.saveContent(piece);
      await ctx.store.saveCalendarSlot({ ...slot, contentPieceId: piece.id, status: 'content_ready' });
      const gate = runQualityGate(piece, brand);
      results.push({ slotId: slot.id, pieceId: piece.id, qualityGatePassed: gate.passed });
    }

    if (results.length || undefinedTopics.length) {
      await ctx.logActivity({
        actor: 'orquestador',
        kind: results.length ? 'action' : 'recommendation',
        summary: results.length
          ? `Generé ${results.length} borradores desde el calendario; están en tu cola de revisión.` +
            (undefinedTopics.length
              ? ` ${undefinedTopics.length} slots siguen sin tema definido: complétalos para generarlos.`
              : '')
          : `No generé borradores: los ${undefinedTopics.length} slots pendientes no tienen tema definido.`,
        explanation: {
          objective: 'Convertir el plan semanal en contenido listo para aprobar',
          decision: 'Solo se generan slots con tema concreto; los demás requieren tu input',
          expectedResult: 'Borradores en revisión, sin contenido inventado',
        },
      });
    }

    return reply.status(results.length ? 201 : 200).send({
      generated: results,
      skippedUndefinedTopic: undefinedTopics.map((s) => ({ slotId: s.id, date: s.date, pillar: s.pillar })),
    });
  });
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const delta = ((8 - day) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
