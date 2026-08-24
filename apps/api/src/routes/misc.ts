import { randomUUID } from 'node:crypto';
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

  // Política de privacidad pública: requisito de Meta para pasar la app a modo Live
  // (Configuración → Básica → URL de la política de privacidad). Servida por la API
  // para que sea accesible por el túnel/dominio sin infraestructura extra.
  app.get('/privacidad', async (_request, reply) => {
    return reply.type('text/html; charset=utf-8').send(PRIVACY_HTML);
  });

  // --- Brand Memory (spec §17) ---
  app.get('/api/brand', async (_request, reply) => {
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    return brand ?? reply.status(404).send({ error: 'not_found' });
  });

  // Validación estricta (spec §32: validación de inputs). Solo campos conocidos,
  // con topes de longitud; el tenantId nunca es modificable desde la API.
  const shortStr = z.string().max(200);
  const brandUpdateSchema = z
    .object({
      brandName: z.string().min(1).max(120),
      employeeName: z.string().max(120),
      description: z.string().max(3000),
      sector: shortStr,
      niche: shortStr,
      market: shortStr,
      services: z.array(z.string().max(300)).max(50),
      differentiators: z.array(z.string().max(300)).max(50),
      audience: z.object({
        segments: z.array(z.string().max(300)).max(50),
        painPoints: z.array(z.string().max(300)).max(50),
        goals: z.array(z.string().max(300)).max(50),
        location: z.string().max(200).optional(),
        ageRange: z.string().max(30).optional(),
        interests: z.array(z.string().max(80)).max(30).optional(),
      }),
      voice: z.object({
        tone: z.string().max(1000),
        allowedWords: z.array(z.string().max(100)).max(200),
        prohibitedWords: z.array(z.string().max(100)).max(200),
        approvedClaims: z.array(z.string().max(300)).max(100),
        languageCode: z.string().max(10),
      }),
      disclaimers: z.array(z.string().max(500)).max(20),
      competitors: z.array(z.string().max(200)).max(50),
      contentPillars: z.array(z.string().max(80)).min(1).max(20),
    })
    .partial()
    .strict();

  app.put('/api/brand', async (request, reply) => {
    const parsed = brandUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const current = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!current) return reply.status(404).send({ error: 'not_found' });
    const changes = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Partial<typeof current>;
    const updated = { ...current, ...changes, tenantId: DEFAULT_TENANT_ID };
    await ctx.store.saveBrand(updated);
    await ctx.logActivity({
      actor: 'usuario',
      kind: 'info',
      summary: 'Actualizaste la memoria de marca.',
    });
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
  // Solo las acciones 'configurable' de la matriz admiten override; las 'always'
  // nunca se relajan por configuración (lo garantiza actionRequiresApproval).
  const approvableAction = z.enum([
    'content_idea',
    'copy_draft',
    'image_generation',
    'calendar_creation',
    'publish_content',
    'reply_comment',
    'reply_dm',
    'paid_campaign',
    'strategy_change',
    'budget_change',
  ]);
  const autonomySchema = z
    .object({
      mode: z.enum(['copilot', 'assisted', 'autonomous']),
      requireApproval: z.record(approvableAction, z.boolean()).default({}),
    })
    .strict();

  app.get('/api/autonomy', async () => ctx.autonomy);

  app.put('/api/autonomy', async (request, reply) => {
    const parsed = autonomySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    ctx.autonomy = { ...ctx.autonomy, ...parsed.data };
    await ctx.store.saveAutonomy(DEFAULT_TENANT_ID, ctx.autonomy);
    await ctx.logActivity({
      actor: 'sistema',
      kind: 'info',
      summary: `Nivel de autonomía actualizado a "${parsed.data.mode}".`,
    });
    return ctx.autonomy;
  });

  // --- Reglas de keywords del Community Manager (spec §26) ---
  const keywordRuleSchema = z
    .object({
      id: z.string().uuid().optional(),
      keyword: z.string().min(2).max(80),
      aliases: z.array(z.string().min(2).max(80)).max(10).default([]),
      matchType: z.enum(['exact', 'contains', 'word_boundary']).default('word_boundary'),
      priority: z.number().int().min(0).max(1000).default(100),
      enabled: z.boolean().default(true),
      cooldownMinutes: z.number().int().min(0).max(43200).default(1440),
      responseTemplate: z.string().min(5).max(1000),
    })
    .strict();

  app.get('/api/keywords', async () => ctx.store.listKeywordRules(DEFAULT_TENANT_ID));

  app.put('/api/keywords', async (request, reply) => {
    const parsed = z.array(keywordRuleSchema).max(50).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsed.error.flatten() });
    }
    const rules = parsed.data.map((r) => ({ ...r, id: r.id ?? randomUUID() }));
    await ctx.store.replaceKeywordRules(DEFAULT_TENANT_ID, rules);
    ctx.keywordMatcher.load(rules);
    await ctx.logActivity({
      actor: 'usuario',
      kind: 'info',
      summary: `Actualizaste las reglas de respuesta automática (${rules.length} reglas).`,
    });
    return rules;
  });

  // --- Aprobaciones (human-in-the-loop, spec §40) ---
  app.get('/api/approvals', async (request) => {
    const { status } = request.query as { status?: 'pending' | 'approved' | 'rejected' };
    return ctx.store.listApprovals(DEFAULT_TENANT_ID, status);
  });

  const resolveSchema = z.object({ reason: z.string().max(500).optional() }).strict();

  app.post('/api/approvals/:id/:action', async (request, reply) => {
    const { id, action } = request.params as { id: string; action: string };
    if (action !== 'approve' && action !== 'reject') {
      return reply.status(400).send({ error: 'invalid_action' });
    }
    const parsedBody = resolveSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'invalid_body', details: parsedBody.error.flatten() });
    }
    const reason = parsedBody.data.reason?.trim();
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
        // Feedback binario persistido (D24): semilla del AI-Match propio.
        await ctx.store.addContentFeedback({
          id: randomUUID(),
          tenantId: DEFAULT_TENANT_ID,
          pieceId: piece.id,
          verdict: target,
          ...(reason ? { reason } : {}),
          pillar: piece.pillar,
          funnel: piece.funnel,
          format: piece.format,
          createdAt: new Date(),
        });
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

/** Contenido de la política de privacidad (es-CO). Ajustar al pasar a fase SaaS. */
const PRIVACY_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Política de privacidad</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #222; }
    h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <h1>Política de privacidad</h1>
  <p>Esta aplicación gestiona la presencia en Instagram de la cuenta profesional conectada
  (publicación de contenido, moderación de comentarios y mensajes) usando exclusivamente
  las APIs oficiales de Meta.</p>
  <h2>Datos que se tratan</h2>
  <p>Con autorización expresa del titular de la cuenta: datos básicos del perfil profesional,
  tokens de acceso (cifrados en reposo), contenido publicado, comentarios y mensajes recibidos.
  No se recopilan datos de usuarios que no interactúen con la cuenta conectada.</p>
  <h2>Uso</h2>
  <p>Los datos se usan únicamente para operar las funciones descritas: publicar contenido
  aprobado, responder comentarios y mensajes, y medir el rendimiento de las publicaciones.
  No se venden ni se comparten con terceros.</p>
  <h2>Conservación y eliminación</h2>
  <p>Los tokens y datos se conservan mientras la cuenta esté conectada. El titular puede
  revocar el acceso en cualquier momento desde la configuración de Instagram
  (Sitio web y permisos → Apps y sitios web), lo que invalida el token de acceso.
  Para solicitar la eliminación de datos almacenados: contactar al administrador de la app.</p>
  <h2>Contacto</h2>
  <p>Responsable: administrador de la aplicación. Contacto a través del correo registrado
  en la app de Meta for Developers.</p>
  <p><em>Última actualización: agosto de 2026.</em></p>
</body>
</html>`;
