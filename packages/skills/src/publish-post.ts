import { ApprovalRequiredError, PolicyViolationError, logger } from '@empleado/shared';
import type { BrandMemory } from '@empleado/brand';
import { canTransition, runQualityGate, type ContentPiece } from '@empleado/content';
import {
  type SocialPolicyEngine,
  type InstagramConnector,
  type PolicyContext,
} from '@empleado/social';

/**
 * Skill: publish_post (spec §13, §42). Flujo completo:
 * Draft → Validation (Quality Gate) → Approval (Policy Engine) → Publish → Verify.
 * Este skill es la ÚNICA vía para publicar; respeta la cadena
 * SKILL → POLICY ENGINE → SOCIAL CONNECTOR → OFFICIAL API (spec §86).
 */
export interface PublishPostInput {
  piece: ContentPiece;
  brand: BrandMemory;
  imageUrl: string;
  policyContext: PolicyContext;
  /** true cuando un humano ya aprobó esta pieza explícitamente. */
  humanApproved: boolean;
}

export interface PublishPostResult {
  piece: ContentPiece;
  mediaId: string;
  permalink?: string;
}

export async function publishPost(
  connector: InstagramConnector,
  policyEngine: SocialPolicyEngine,
  input: PublishPostInput,
): Promise<PublishPostResult> {
  const { piece, brand } = input;

  // 1. Estado válido para publicar.
  if (!canTransition(piece.status, 'published')) {
    throw new PolicyViolationError(
      `La pieza está en estado "${piece.status}" y no puede publicarse directamente.`,
    );
  }

  // 2. Quality Gate (spec §46).
  const gate = runQualityGate(piece, brand);
  if (!gate.passed) {
    const failed = gate.results.filter((r) => !r.passed).map((r) => `${r.check}: ${r.detail ?? ''}`);
    throw new PolicyViolationError(`La pieza no pasa el Quality Gate: ${failed.join(' | ')}`);
  }

  // 3. Policy Engine (spec §82).
  const decision = policyEngine.evaluate('publish_post', input.policyContext);
  if (decision.verdict === 'block') {
    throw new PolicyViolationError(decision.reasons.join(' '));
  }
  if (decision.verdict === 'human_review' && !input.humanApproved) {
    throw new ApprovalRequiredError(
      'Publicar requiere aprobación humana según la configuración de autonomía.',
      { pieceId: piece.id },
    );
  }

  // 4. Publicación oficial + verificación.
  const caption = [piece.hook, piece.body, piece.cta].filter(Boolean).join('\n\n');
  const result = await connector.publishImage(input.imageUrl, caption);

  logger.info({ pieceId: piece.id, mediaId: result.mediaId }, 'Pieza publicada y verificada');

  const published: ContentPiece = {
    ...piece,
    status: 'published',
    publishedMediaId: result.mediaId,
    updatedAt: new Date(),
  };
  return { piece: published, mediaId: result.mediaId, ...(result.permalink ? { permalink: result.permalink } : {}) };
}
