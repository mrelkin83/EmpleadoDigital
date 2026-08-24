import type { FastifyInstance } from 'fastify';
import {
  isValidSignature,
  parseWebhookPayload,
  resolveVerificationChallenge,
} from '@empleado/social';
import { logger } from '@empleado/shared';
import { getEnv } from '../env.js';
import { handleCommentEvent } from '../pipeline/comment-pipeline.js';
import { handleMessageEvent } from '../pipeline/message-pipeline.js';
import type { AppContext } from '../context.js';

/**
 * Webhooks de Meta (patrón adaptado de juancadile/instabot):
 * - GET: challenge de verificación.
 * - POST: firma HMAC verificada sobre raw body; 200 inmediato (ventana de 5s de Meta);
 *   procesamiento asíncrono de eventos.
 */
export function registerWebhookRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/webhooks/meta', async (request, reply) => {
    const env = getEnv();
    const q = request.query as Record<string, string | undefined>;
    const challenge = resolveVerificationChallenge(env.META_VERIFY_TOKEN ?? '', {
      ...(q['hub.mode'] !== undefined ? { mode: q['hub.mode'] } : {}),
      ...(q['hub.verify_token'] !== undefined ? { token: q['hub.verify_token'] } : {}),
      ...(q['hub.challenge'] !== undefined ? { challenge: q['hub.challenge'] } : {}),
    });
    if (challenge === null) {
      return reply.status(403).send('Forbidden');
    }
    return reply.status(200).send(challenge);
  });

  app.post('/webhooks/meta', { config: { rawBody: true } }, async (request, reply) => {
    const env = getEnv();
    if (!env.META_APP_SECRET) {
      logger.error('META_APP_SECRET no configurado; webhook rechazado');
      return reply.status(503).send({ error: 'webhook_not_configured' });
    }

    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
    if (!rawBody || !isValidSignature(env.META_APP_SECRET, rawBody, signature)) {
      logger.warn('Firma de webhook inválida');
      return reply.status(401).send({ error: 'invalid_signature' });
    }

    // 200 inmediato; procesamiento fuera de la respuesta.
    reply.status(200).send('EVENT_RECEIVED');

    setImmediate(() => {
      try {
        const events = parseWebhookPayload(request.body);
        for (const event of events) {
          if (event.type === 'comment') {
            handleCommentEvent(ctx, event).catch((err) =>
              logger.error({ err }, 'Error procesando comentario'),
            );
          } else if (event.type === 'message') {
            handleMessageEvent(ctx, event).catch((err) =>
              logger.error({ err }, 'Error procesando DM'),
            );
          } else {
            logger.info({ type: event.type }, 'Evento de webhook recibido (handler pendiente)');
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error parseando payload de webhook');
      }
    });
  });
}
