import { randomUUID } from 'node:crypto';
import { classifyComment } from '@empleado/skills';
import type { MetaMessageEvent } from '@empleado/social';
import { logger } from '@empleado/shared';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

/**
 * Pipeline de mensajes directos (Fase 3, espejo del de comentarios):
 * DM → clasificación → lead → escalamiento humano | keyword match →
 * cooldown → POLICY ENGINE → (allow: respuesta | human_review: aprobación).
 * Nota: los webhooks de messages solo llegan con la app publicada; el pipeline
 * queda listo para ese momento.
 */
export async function handleMessageEvent(ctx: AppContext, event: MetaMessageEvent): Promise<void> {
  const tenantId = DEFAULT_TENANT_ID;
  const text = event.text?.trim();
  if (!text) return; // adjuntos/reacciones sin texto: nada que clasificar aún

  const classification = await classifyComment(ctx.router, tenantId, text).catch(() => ({
    category: 'consulta' as const,
    requiresHuman: true,
  }));

  await ctx.logActivity({
    actor: 'community_manager',
    kind: 'info',
    summary: `Nuevo DM clasificado como "${classification.category}".`,
  });

  if (['lead', 'consulta', 'solicitud_comercial'].includes(classification.category)) {
    await ctx.store.upsertLead({
      tenantId,
      igUserId: event.senderId,
      igUsername: event.senderId, // el webhook de messages no trae username; se resuelve al contestar
      source: 'dm',
    });
  }

  if (classification.requiresHuman) {
    await ctx.store.saveApproval({
      id: randomUUID(),
      tenantId,
      kind: 'reply_dm',
      resourceId: event.senderId,
      summary: `DM entrante (${classification.category}): "${text.slice(0, 140)}"`,
      status: 'pending',
      createdAt: new Date(),
    });
    await ctx.logActivity({
      actor: 'community_manager',
      kind: 'approval_request',
      summary: `Escalé a revisión humana un DM (${classification.category}).`,
    });
    return;
  }

  const rule = ctx.keywordMatcher.match(text);
  if (!rule) return;

  if (
    ctx.cooldowns.isRateLimited(event.senderId) ||
    ctx.cooldowns.isOnCooldown(event.senderId, rule.id, rule.cooldownMinutes)
  ) {
    logger.info({ senderId: event.senderId, ruleId: rule.id }, 'DM omitido por cooldown/rate limit');
    return;
  }

  const decision = ctx.policyEngine.evaluate('send_dm', {
    tenantId,
    grantedScopes: ctx.grantedScopes,
    autonomy: ctx.autonomy,
    dataProvenance: {
      source: 'DM entrante a cuenta propia (webhook oficial de Meta)',
      acquisitionMethod: 'official_api',
      authorizationStatus: 'authorized',
      collectedAt: new Date(),
    },
  });

  if (decision.verdict === 'block') {
    logger.warn({ reasons: decision.reasons }, 'Respuesta de DM bloqueada por Policy Engine');
    return;
  }

  const responseText = rule.responseTemplate.replaceAll('{{username}}', '');

  if (decision.verdict === 'human_review') {
    await ctx.store.saveApproval({
      id: randomUUID(),
      tenantId,
      kind: 'reply_dm',
      resourceId: event.senderId,
      summary: `Respuesta sugerida al DM: "${responseText.slice(0, 140)}"`,
      status: 'pending',
      createdAt: new Date(),
    });
    await ctx.logActivity({
      actor: 'community_manager',
      kind: 'approval_request',
      summary: 'Preparé una respuesta a un DM y está pendiente de tu aprobación.',
    });
    return;
  }

  if (!ctx.instagram) return;
  await ctx.instagram.sendTextDM(event.senderId, responseText);
  ctx.cooldowns.recordTrigger(event.senderId, rule.id);
  await ctx.logActivity({
    actor: 'community_manager',
    kind: 'action',
    summary: `Respondí un DM automáticamente (regla "${rule.keyword}").`,
  });
}
