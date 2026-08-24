import { logger } from '@empleado/shared';
import type { MetaCommentEvent } from '@empleado/social';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';
import { handleCommentEvent } from './comment-pipeline.js';

/**
 * Polling de comentarios: con la app de Meta sin publicar, los webhooks de
 * comments no se entregan (limitación de Meta, no configurable). Este poller lee
 * los comentarios de las publicaciones recientes vía API oficial y los inyecta al
 * MISMO pipeline que usarían los webhooks. Cuando la app se publique (App Review),
 * los webhooks toman el relevo y la deduplicación evita el doble procesamiento.
 */
const POLL_INTERVAL_MS = 2 * 60 * 1000;
const RECENT_MEDIA_LIMIT = 5;

export function startCommentPolling(ctx: AppContext): () => void {
  let running = false;

  const tick = async (): Promise<void> => {
    if (running || !ctx.instagram) return;
    running = true;
    try {
      const instagram = ctx.instagram;
      const media = await instagram.getOwnMedia(RECENT_MEDIA_LIMIT);
      logger.info({ mediaCount: media.length }, 'Polling: publicaciones a revisar');
      for (const item of media) {
        const comments = await instagram.getMediaComments(item.id);
        logger.info({ mediaId: item.id, comments: comments.length }, 'Polling: comentarios leídos');
        for (const comment of comments) {
          // Comentarios propios (respuestas del negocio) no entran al pipeline.
          if (!comment.from || comment.from.id === instagram.accountId) continue;
          if (!comment.text) continue;

          const firstTime = await ctx.store.markCommentProcessed(DEFAULT_TENANT_ID, comment.id);
          if (!firstTime) continue;

          const event: MetaCommentEvent = {
            type: 'comment',
            commentId: comment.id,
            mediaId: item.id,
            from: comment.from,
            text: comment.text,
          };
          await handleCommentEvent(ctx, event).catch((err) =>
            logger.error({ err, commentId: comment.id }, 'Error procesando comentario (polling)'),
          );
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Polling de comentarios: pasada fallida, se reintenta en el próximo ciclo');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  // Primera pasada a los pocos segundos del arranque (deja estabilizar la conexión).
  const kickoff = setTimeout(() => void tick(), 5_000);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, 'Polling de comentarios activo');

  return () => {
    clearInterval(timer);
    clearTimeout(kickoff);
  };
}
