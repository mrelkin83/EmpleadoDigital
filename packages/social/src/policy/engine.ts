import {
  actionRequiresApproval,
  isProvenanceUsableForAutomation,
  logger,
  type ApprovableAction,
  type AutonomyConfig,
  type DataProvenance,
} from '@empleado/shared';
import { ACTION_REQUIRED_SCOPES, ACTION_RISK, type SocialActionType } from './actions.js';

/**
 * Social Policy Engine (spec §82): toda acción social pasa por esta capa.
 * Ningún agente tiene acceso directo a APIs sociales (spec §86):
 * AGENT → SKILL → POLICY ENGINE → SOCIAL CONNECTOR → OFFICIAL API.
 */
export type PolicyVerdict = 'allow' | 'block' | 'human_review';

export interface PolicyDecision {
  verdict: PolicyVerdict;
  action: SocialActionType;
  riskLevel: number;
  reasons: string[];
}

export interface PolicyContext {
  tenantId: string;
  /** Scopes realmente concedidos a la cuenta conectada. */
  grantedScopes: string[];
  autonomy: AutonomyConfig;
  /** Procedencia de los datos que alimentan la acción, si aplica (spec §80). */
  dataProvenance?: DataProvenance;
}

/** Mapea acciones sociales a la matriz de aprobación del tenant cuando corresponde. */
const ACTION_TO_APPROVABLE: Partial<Record<SocialActionType, ApprovableAction>> = {
  publish_post: 'publish_content',
  schedule_post: 'publish_content',
  reply_comment: 'reply_comment',
  send_dm: 'reply_dm',
  execute_paid_campaign: 'paid_campaign',
};

export class SocialPolicyEngine {
  evaluate(action: SocialActionType, context: PolicyContext): PolicyDecision {
    const riskLevel = ACTION_RISK[action];
    const reasons: string[] = [];

    // Nivel 4: prohibido por diseño (spec §76, §90). Sin excepciones ni configuración que lo habilite.
    if (riskLevel === 4) {
      const decision: PolicyDecision = {
        verdict: 'block',
        action,
        riskLevel,
        reasons: [
          'Acción de nivel 4: prohibida por las políticas de la plataforma y por diseño del producto.',
          'No existe configuración que habilite esta acción. Alternativas legítimas: contenido orgánico, pauta oficial, audiencias propias.',
        ],
      };
      logger.warn({ action, tenantId: context.tenantId }, 'Policy Engine: acción prohibida bloqueada');
      return decision;
    }

    // Verificación de permisos reales de la cuenta (spec §9, §82 CHECK ACCOUNT PERMISSIONS).
    const requiredScopes = ACTION_REQUIRED_SCOPES[action] ?? [];
    const missingScopes = requiredScopes.filter((s) => !context.grantedScopes.includes(s));
    if (missingScopes.length > 0) {
      return {
        verdict: 'block',
        action,
        riskLevel,
        reasons: [
          `La cuenta conectada no tiene los permisos requeridos: ${missingScopes.join(', ')}.`,
          'Reconecta la cuenta concediendo los permisos necesarios; no se intentará ningún workaround.',
        ],
      };
    }

    // Procedencia de datos (spec §80): sin procedencia autorizada no hay acción comercial automatizada.
    if (context.dataProvenance && !isProvenanceUsableForAutomation(context.dataProvenance)) {
      return {
        verdict: 'block',
        action,
        riskLevel,
        reasons: [
          `Los datos de origen "${context.dataProvenance.source}" no tienen procedencia autorizada ` +
            `(método: ${context.dataProvenance.acquisitionMethod}, estado: ${context.dataProvenance.authorizationStatus}).`,
        ],
      };
    }

    // Matriz de autonomía/aprobación (spec §10-11).
    const approvable = ACTION_TO_APPROVABLE[action];
    if (approvable && actionRequiresApproval(approvable, context.autonomy)) {
      reasons.push(`La acción "${approvable}" requiere aprobación humana según la configuración de autonomía.`);
      return { verdict: 'human_review', action, riskLevel, reasons };
    }

    // Nivel 3 sin mapeo de aprobación explícito: por defecto, revisión humana (spec §83).
    if (riskLevel === 3 && !approvable) {
      return {
        verdict: 'human_review',
        action,
        riskLevel,
        reasons: ['Acción de alto riesgo sin regla de autonomía explícita: escalada a revisión humana.'],
      };
    }

    reasons.push('Acción permitida por políticas, permisos y configuración de autonomía.');
    return { verdict: 'allow', action, riskLevel, reasons };
  }
}
