/**
 * Catálogo de acciones sociales con su nivel de riesgo (spec §83, §90).
 * Nivel 1: bajo riesgo. Nivel 2: moderado. Nivel 3: alto (requiere controles y
 * normalmente aprobación humana). Nivel 4: NO PERMITIDO — nunca se implementa.
 */
export type SocialActionType =
  // Nivel 1
  | 'read_own_media'
  | 'read_own_insights'
  | 'read_own_comments'
  | 'analyze_aggregated_signals'
  // Nivel 2
  | 'publish_post'
  | 'schedule_post'
  | 'recommend_paid_campaign'
  // Nivel 3
  | 'reply_comment'
  | 'send_dm'
  | 'execute_paid_campaign'
  | 'use_personal_data'
  // Nivel 4 — catalogadas explícitamente para que el Policy Engine las bloquee SIEMPRE.
  | 'scrape_followers'
  | 'scrape_likers'
  | 'scrape_commenters'
  | 'mass_follow'
  | 'mass_like'
  | 'mass_dm'
  | 'buy_followers'
  | 'fake_engagement'
  | 'evade_rate_limits';

export type RiskLevel = 1 | 2 | 3 | 4;

export const ACTION_RISK: Record<SocialActionType, RiskLevel> = {
  read_own_media: 1,
  read_own_insights: 1,
  read_own_comments: 1,
  analyze_aggregated_signals: 1,
  publish_post: 2,
  schedule_post: 2,
  recommend_paid_campaign: 2,
  reply_comment: 3,
  send_dm: 3,
  execute_paid_campaign: 3,
  use_personal_data: 3,
  scrape_followers: 4,
  scrape_likers: 4,
  scrape_commenters: 4,
  mass_follow: 4,
  mass_like: 4,
  mass_dm: 4,
  buy_followers: 4,
  fake_engagement: 4,
  evade_rate_limits: 4,
};

/** Scopes de la API de Instagram requeridos por acción (validados tras el OAuth, spec §9). */
export const ACTION_REQUIRED_SCOPES: Partial<Record<SocialActionType, string[]>> = {
  read_own_media: ['instagram_business_basic'],
  read_own_insights: ['instagram_business_manage_insights'],
  read_own_comments: ['instagram_business_manage_comments'],
  publish_post: ['instagram_business_content_publish'],
  schedule_post: ['instagram_business_content_publish'],
  reply_comment: ['instagram_business_manage_comments'],
  send_dm: ['instagram_business_manage_messages'],
};
