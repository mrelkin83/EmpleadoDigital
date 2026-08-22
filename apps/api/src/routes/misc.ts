import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canTransition } from '@empleado/content';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

export function registerMiscRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/health', async () => ({
    status: 'ok',
    instagramConnected: ctx.instagram !== null,
    time: new Date().toISOString(),
  }));

  // --- Brand Memory (spec §17) ---
  app.get('/api/brand', async (_request, reply) => {
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    return brand ?? reply.status(404).send({ error: 'not_found' });
  });

  app.put('/api/brand', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const current = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!current) return reply.status(404).send({ error: 'not_found' });
    // Merge superficial controlado: el tenantId no es modificable.
    const updated = { ...current, ...body, tenantId: DEFAULT_TENANT_ID };
    await ctx.store.saveBrand(updated as typeof current);
    return updated;
  });

  // --- Bitácora (spec §30) ---
  app.get('/api/activity', async (request) => {
    const { limit } = request.query as { limit?: string };
    return ctx.store.listActivity(DEFAULT_TENANT_ID, limit ? Number(limit) : 50);
  });

  // --- Leads ---
  app.get('/api/leads', async () => ctx.store.listLeads(DEFAULT_TENANT_ID));

  // --- Autonomía (spec §10-11) ---
  const autonomySchema = z.object({
    mode: z.enum(['copilot', 'assisted', 'autonomous']),
    requireApproval: z.record(z.boolean()).default({}),
  });

  app.get('/api/autonomy', async () => ctx.autonomy);

  app.put('/api/autonomy', async (request, reply) => {
    const parsed = autonomySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    ctx.autonomy = { ...ctx.autonomy, ...parsed.data };
    await ctx.logActivity({
      actor: 'sistema',
      kind: 'info',
      summary: `Nivel de autonomía actualizado a "${parsed.data.mode}".`,
    });
    return ctx.autonomy;
  });

  // --- Aprobaciones (human-in-the-loop, spec §40) ---
  app.get('/api/approvals', async (request) => {
    const { status } = request.query as { status?: 'pending' | 'approved' | 'rejected' };
    return ctx.store.listApprovals(DEFAULT_TENANT_ID, status);
  });

  app.post('/api/approvals/:id/:action', async (request, reply) => {
    const { id, action } = request.params as { id: string; action: string };
    if (action !== 'approve' && action !== 'reject') {
      return reply.status(400).send({ error: 'invalid_action' });
    }
    const approval = await ctx.store.getApproval(DEFAULT_TENANT_ID, id);
    if (!approval) return reply.status(404).send({ error: 'not_found' });
    if (approval.status !== 'pending') {
      return reply.status(409).send({ error: 'already_resolved', status: approval.status });
    }

    const resolved = {
      ...approval,
      status: action === 'approve' ? ('approved' as const) : ('rejected' as const),
      resolvedAt: new Date(),
    };
    await ctx.store.saveApproval(resolved);

    // Si es una aprobación de contenido, refleja la decisión en la pieza (spec §40: reanudar tras aprobación).
    if (approval.kind === 'publish_content') {
      const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, approval.resourceId);
      if (piece) {
        const target = action === 'approve' ? ('approved' as const) : ('rejected' as const);
        if (canTransition(piece.status, target)) {
          await ctx.store.saveContent({
            ...piece,
            status: target,
            approval: target,
            updatedAt: new Date(),
          });
        }
      }
    }

    await ctx.logActivity({
      actor: 'usuario',
      kind: 'info',
      summary: `${action === 'approve' ? 'Aprobaste' : 'Rechazaste'}: ${approval.summary}`,
    });
    return resolved;
  });
}
