import { randomUUID } from 'node:crypto';
import { classifyComment } from '@empleado/skills';
import type { MetaCommentEvent } from '@empleado/social';
import { logger } from '@empleado/shared';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

/**
 * Pipeline de comentarios (Fase 3 del roadmap, sembrado desde el patrón instabot):
 * comentario → clasificación → keyword match → cooldown/rate limit →
 * POLICY ENGINE → (allow: DM autorizado | human_review: solicitud de aprobación | block: registro).
 *
 * Diferencias deliberadas respecto a instabot:
 * - Toda respuesta pasa por el SocialPolicyEngine y la matriz de autonomía (spec §82, §86).
 * - La clasificación IA detecta leads/quejas/riesgo y escala a humano (spec §26-27).
 */
export async function handleCommentEvent(ctx: AppContext, event: MetaCommentEvent): Promise<void> {
  const tenantId = DEFAULT_TENANT_ID;

  // 1. Clasificación de la interacción (spec §26).
  const classification = await classifyComment(ctx.router, tenantId, event.text).catch(() => ({
    category: 'consulta' as const,
    requiresHuman: true,
  }));

  await ctx.logActivity({
    actor: 'community_manager',
    kind: 'info',
    summary: `Nuevo comentario de @${event.from.username} clasificado como "${classification.category}".`,
  });

  // 2. Lead capture (patrón instabot): registrar interesados con procedencia autorizada
  //    (el usuario interactuó con NUESTRA cuenta; es dato propio, no scraping de terceros).
  if (['lead', 'consulta', 'solicitud_comercial'].includes(classification.category)) {
    await ctx.store.upsertLead({
      tenantId,
      igUserId: event.from.id,
      igUsername: event.from.username,
      source: 'comment',
    });
  }

  // 3. Escalamiento humano obligatorio (spec §27).
  if (classification.requiresHuman) {
    await ctx.store.saveApproval({
      id: randomUUID(),
      tenantId,
      kind: 'reply_comment',
      resourceId: event.commentId,
      summary: `Comentario de @${event.from.username} (${classification.category}): "${event.text.slice(0, 140)}"`,
      status: 'pending',
      createdAt: new Date(),
    });
    await ctx.logActivity({
      actor: 'community_manager',
      kind: 'approval_request',
      summary: `Escalé a revisión humana un comentario de @${event.from.username} (${classification.category}).`,
    });
    return;
  }

  // 4. Respuesta automática por keyword, solo si hay regla y las políticas lo permiten.
  const rule = ctx.keywordMatcher.match(event.text);
  if (!rule) return;

  if (ctx.cooldowns.isRateLimited(event.from.id) || ctx.cooldowns.isOnCooldown(event.from.id, rule.id, rule.cooldownMinutes)) {
    logger.info({ userId: event.from.id, ruleId: rule.id }, 'Comentario omitido por cooldown/rate limit');
    return;
  }

  const decision = ctx.policyEngine.evaluate('send_dm', {
    tenantId,
    grantedScopes: ctx.grantedScopes,
    autonomy: ctx.autonomy,
    dataProvenance: {
      source: 'comentario en cuenta propia (webhook oficial de Meta)',
      acquisitionMethod: 'official_api',
      authorizationStatus: 'authorized',
      collectedAt: new Date(),
    },
  });

  if (decision.verdict === 'block') {
    logger.warn({ reasons: decision.reasons }, 'DM bloqueado por Policy Engine');
    return;
  }

  const responseText = rule.responseTemplate.replaceAll('{{username}}', event.from.username);

  if (decision.verdict === 'human_review') {
    await ctx.store.saveApproval({
      id: randomUUID(),
      tenantId,
      kind: 'reply_dm',
      resourceId: event.commentId,
      summary: `DM sugerido para @${event.from.username}: "${responseText.slice(0, 140)}"`,
      status: 'pending',
      createdAt: new Date(),
    });
    await ctx.logActivity({
      actor: 'community_manager',
      kind: 'approval_request',
      summary: `Preparé un DM para @${event.from.username} y está pendiente de tu aprobación.`,
    });
    return;
  }

  // verdict === 'allow': autonomía configurada lo permite.
  if (!ctx.instagram) return;
  await ctx.instagram.sendTextDM(event.from.id, responseText);
  ctx.cooldowns.recordTrigger(event.from.id, rule.id);
  await ctx.logActivity({
    actor: 'community_manager',
    kind: 'action',
    summary: `Respondí por DM a @${event.from.username} (regla "${rule.keyword}").`,
    explanation: {
      objective: 'Atender una consulta entrante y abrir conversación',
      evidence: `Keyword "${rule.keyword}" detectada en comentario`,
      decision: 'Enviar respuesta autorizada por la configuración de autonomía',
      expectedResult: 'Conversación iniciada con un interesado real',
    },
  });
}
