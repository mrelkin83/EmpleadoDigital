import { publishPost } from '@empleado/skills';
import { logger } from '@empleado/shared';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';
import { getEnv } from '../env.js';

/**
 * Publicación programada (spec §42: scheduled→published|failed). Cada minuto
 * busca piezas 'scheduled' vencidas y las publica por el MISMO camino que la
 * publicación manual (Quality Gate + Policy Engine + API oficial). La pieza
 * llegó a 'scheduled' desde 'approved', así que la aprobación humana ya existe.
 * MVP: corre en el proceso de la API (como el poller); mover a la cola del
 * worker cuando haya despliegue multi-proceso.
 */
const SWEEP_INTERVAL_MS = 60 * 1000;

export function startPublishScheduler(ctx: AppContext): () => void {
  let running = false;

  const sweep = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const content = await ctx.store.listContent(DEFAULT_TENANT_ID);
      const due = content.filter(
        (p) => p.status === 'scheduled' && p.scheduledAt && p.scheduledAt.getTime() <= Date.now(),
      );
      for (const piece of due) {
        await publishDuePiece(ctx, piece.id).catch((err) =>
          logger.error({ err, pieceId: piece.id }, 'Scheduler: error publicando pieza programada'),
        );
      }
    } catch (err) {
      logger.warn({ err }, 'Scheduler: pasada fallida, se reintenta en el próximo ciclo');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  logger.info({ intervalMs: SWEEP_INTERVAL_MS }, 'Scheduler de publicación programada activo');
  return () => clearInterval(timer);
}

async function publishDuePiece(ctx: AppContext, pieceId: string): Promise<void> {
  // Releer la pieza dentro del ciclo: pudo cambiar (cancelación, edición).
  const piece = await ctx.store.getContent(DEFAULT_TENANT_ID, pieceId);
  if (!piece || piece.status !== 'scheduled') return;

  const fail = async (reason: string): Promise<void> => {
    await ctx.store.saveContent({ ...piece, status: 'failed', updatedAt: new Date() });
    await ctx.logActivity({
      actor: 'orquestador',
      kind: 'alert',
      summary: `No pude publicar la pieza programada "${piece.hook || piece.topic}": ${reason}`,
    });
  };

  if (!ctx.instagram) return fail('Instagram no está conectado.');
  const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
  if (!brand) return fail('falta la Brand Memory.');
  if (!piece.media) return fail('la pieza no tiene material.');
  const redirectUri = getEnv().OAUTH_REDIRECT_URI;
  if (!redirectUri) return fail('falta OAUTH_REDIRECT_URI para servir el material.');
  const base = new URL(redirectUri).origin;
  const media = {
    url: `${base}/media/${piece.media.filename}`,
    kind: piece.media.kind,
    ...(piece.media.kind === 'carousel' && piece.media.items
      ? { urls: piece.media.items.map((i) => `${base}/media/${i.filename}`) }
      : {}),
  };

  try {
    const result = await publishPost(ctx.instagram, ctx.policyEngine, {
      piece,
      brand,
      media,
      // La transición approved→scheduled exigió aprobación previa (spec §42).
      humanApproved: piece.approval === 'approved',
      policyContext: {
        tenantId: DEFAULT_TENANT_ID,
        grantedScopes: ctx.grantedScopes,
        autonomy: ctx.autonomy,
      },
    });
    await ctx.store.saveContent(result.piece);
    await ctx.logActivity({
      actor: 'orquestador',
      kind: 'action',
      summary: `Publiqué la pieza programada "${piece.hook || piece.topic}" en Instagram.`,
      explanation: {
        objective: 'Cumplir el calendario editorial sin intervención manual',
        decision: 'Publicación automática a la hora programada, con aprobación humana previa',
        expectedResult: 'Pieza visible en el perfil a la hora planificada',
      },
    });
  } catch (err) {
    await fail(err instanceof Error ? err.message : 'error desconocido');
  }
}
