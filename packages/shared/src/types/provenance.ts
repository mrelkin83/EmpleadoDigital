/**
 * Procedencia de datos (spec §80): toda fuente de datos debe poder responder
 * "¿de dónde salió este dato y por qué podemos utilizarlo?".
 * Si un dato no tiene procedencia autorizada, no puede usarse en acciones comerciales automatizadas.
 */
export interface DataProvenance {
  source: string;
  acquisitionMethod:
    | 'official_api'
    | 'user_provided'
    | 'oauth_authorized'
    | 'public_aggregated'
    | 'generated_by_ai'
    | 'unknown';
  authorizationStatus: 'authorized' | 'pending_review' | 'unauthorized';
  collectedAt: Date;
  permittedUse?: string;
  retentionPolicy?: string;
}

export function isProvenanceUsableForAutomation(p: DataProvenance): boolean {
  return p.authorizationStatus === 'authorized' && p.acquisitionMethod !== 'unknown';
}

/**
 * Estado de verificación del conocimiento (spec §18): crítico en sectores regulados.
 */
export type KnowledgeVerification = 'verified' | 'generated' | 'pending_verification';
