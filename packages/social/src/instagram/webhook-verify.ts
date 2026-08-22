import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificación de firma de webhooks de Meta (X-Hub-Signature-256).
 * Patrón adaptado de juancadile/instabot: HMAC-SHA256 sobre el raw body con
 * comparación en tiempo constante.
 */
export function computeSignature(secret: string, payload: string | Buffer): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
}

export function isValidSignature(
  secret: string,
  rawBody: string | Buffer,
  receivedSignature: string | undefined,
): boolean {
  if (!receivedSignature) return false;
  const expected = computeSignature(secret, rawBody);
  const sigBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expected);
  return sigBuffer.length === expectedBuffer.length && timingSafeEqual(sigBuffer, expectedBuffer);
}

/** Respuesta al challenge de verificación de Meta (GET /webhook). */
export function resolveVerificationChallenge(
  verifyToken: string,
  query: { mode?: string; token?: string; challenge?: string },
): string | null {
  if (query.mode === 'subscribe' && query.token === verifyToken && query.challenge) {
    return query.challenge;
  }
  return null;
}
