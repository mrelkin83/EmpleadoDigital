/**
 * Motor de autonomía (spec §10-11): autonomía dentro de límites.
 * "Autónomo" nunca significa permiso ilimitado.
 */
export type AutonomyMode = 'copilot' | 'assisted' | 'autonomous';

/** Acciones configurables en la matriz de aprobación (spec §10, tabla de aprobaciones). */
export type ApprovableAction =
  | 'content_idea'
  | 'copy_draft'
  | 'image_generation'
  | 'calendar_creation'
  | 'publish_content'
  | 'reply_comment'
  | 'reply_dm'
  | 'paid_campaign'
  | 'strategy_change'
  | 'budget_change';

export type ApprovalRequirement = 'never' | 'configurable' | 'always';

/** Valores por defecto del spec. `paid_campaign`, `strategy_change` y `budget_change` siempre requieren humano. */
export const DEFAULT_APPROVAL_MATRIX: Record<ApprovableAction, ApprovalRequirement> = {
  content_idea: 'never',
  copy_draft: 'never',
  image_generation: 'never',
  calendar_creation: 'never',
  publish_content: 'configurable',
  reply_comment: 'configurable',
  reply_dm: 'configurable',
  paid_campaign: 'always',
  strategy_change: 'always',
  budget_change: 'always',
};

export interface AutonomyConfig {
  mode: AutonomyMode;
  /** Overrides del tenant sobre las acciones 'configurable'. true = requiere aprobación humana. */
  requireApproval: Partial<Record<ApprovableAction, boolean>>;
  dailyBudgetUsd?: number;
  monthlyBudgetUsd?: number;
  /** Ventana horaria de operación (hora local del tenant, 0-23). */
  operatingHours?: { from: number; to: number };
}

export const DEFAULT_AUTONOMY: AutonomyConfig = {
  mode: 'copilot',
  requireApproval: {},
};

/**
 * Resuelve si una acción requiere aprobación humana dada la configuración del tenant.
 * Las acciones 'always' no pueden desactivarse por configuración.
 */
export function actionRequiresApproval(action: ApprovableAction, config: AutonomyConfig): boolean {
  const base = DEFAULT_APPROVAL_MATRIX[action];
  if (base === 'always') return true;
  if (base === 'never') return false;
  // 'configurable': en modo copiloto todo lo configurable requiere aprobación;
  // en otros modos manda el override del tenant (por defecto, aprobar).
  if (config.mode === 'copilot') return true;
  return config.requireApproval[action] ?? true;
}
