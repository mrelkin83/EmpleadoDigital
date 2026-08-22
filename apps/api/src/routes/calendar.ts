import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validateWeeklyMix } from '@empleado/content';
import { planWeek } from '@empleado/skills';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

const planSchema = z.object({
  /** Lunes de la semana (YYYY-MM-DD). Por defecto: el próximo lunes. */
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  defaultTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

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
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const delta = ((8 - day) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
