import type { FastifyInstance } from 'fastify';
import { logger } from '@empleado/shared';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

/**
 * Analytics del MVP (spec §23): métricas propias de las publicaciones hechas por
 * el sistema, leídas por API oficial. Sin datos inventados: si Meta no entrega
 * una métrica, no aparece. Caché de 10 min para respetar los rate limits.
 */
const INSIGHT_METRICS = ['reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions'];
/** Subconjunto seguro si Meta rechaza alguna métrica del set completo. */
const FALLBACK_METRICS = ['reach', 'likes', 'comments'];
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface PostAnalytics {
  pieceId: string;
  hook: string;
  topic: string;
  format: string;
  pillar: string;
  funnel: string;
  publishedMediaId: string;
  permalink?: string;
  metrics: Record<string, number>;
}

export interface AnalyticsSnapshot {
  connected: boolean;
  posts: PostAnalytics[];
  totals: Record<string, number>;
}

const cache = new Map<string, { at: number; data: PostAnalytics }>();

/** Recolecta las métricas de todas las piezas publicadas (compartido con el Analista). */
export async function collectAnalytics(ctx: AppContext): Promise<AnalyticsSnapshot> {
  if (!ctx.instagram) {
    return { connected: false, posts: [], totals: {} };
  }
  const instagram = ctx.instagram;

  const content = await ctx.store.listContent(DEFAULT_TENANT_ID);
  const published = content.filter((p) => p.status === 'published' && p.publishedMediaId);

  const posts: PostAnalytics[] = [];
  for (const piece of published) {
    const mediaId = piece.publishedMediaId!;
    const cached = cache.get(mediaId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      posts.push(cached.data);
      continue;
    }

    let metrics: Record<string, number> = {};
    try {
      metrics = (await instagram.getMediaInsights(mediaId, INSIGHT_METRICS)).metrics;
    } catch {
      try {
        metrics = (await instagram.getMediaInsights(mediaId, FALLBACK_METRICS)).metrics;
      } catch (err) {
        logger.warn({ err, mediaId }, 'Analytics: no se pudieron leer los insights del post');
      }
    }
    const permalink = await instagram.getPermalink(mediaId);

    const data: PostAnalytics = {
      pieceId: piece.id,
      hook: piece.hook,
      topic: piece.topic,
      format: piece.format,
      pillar: piece.pillar,
      funnel: piece.funnel,
      publishedMediaId: mediaId,
      ...(permalink ? { permalink } : {}),
      metrics,
    };
    // Un resultado sin métricas es un fallo transitorio (permiso recién concedido,
    // rate limit...): no se cachea, para reintentar en la próxima consulta.
    if (Object.keys(metrics).length > 0) {
      cache.set(mediaId, { at: Date.now(), data });
    }
    posts.push(data);
  }

  const totals: Record<string, number> = {};
  for (const post of posts) {
    for (const [name, value] of Object.entries(post.metrics)) {
      totals[name] = (totals[name] ?? 0) + value;
    }
  }

  return { connected: true, posts, totals };
}

export function registerAnalyticsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/analytics', async () => collectAnalytics(ctx));

  /** Recomendaciones del agente Analista, calculadas al momento sobre datos reales. */
  app.get('/api/recommendations', async () => {
    const { buildRecommendations } = await import('../pipeline/analyst.js');
    return { recommendations: await buildRecommendations(ctx) };
  });

  /** Ranking de pilares por rendimiento + preferencias (Fase 5): transparencia del aprendizaje. */
  app.get('/api/insights/pillars', async () => {
    const brand = await ctx.store.getBrand(DEFAULT_TENANT_ID);
    if (!brand) return { ranking: [], scores: [] };
    const { rankPillars } = await import('../pipeline/performance.js');
    return rankPillars(ctx, brand.contentPillars);
  });

  /**
   * Reporte semanal para el cliente (patrón del análisis de competencia, D19/D24):
   * qué se publicó, cómo rindió, leads captados y qué viene. Determinista y bajo
   * demanda — sin datos inventados.
   */
  app.get('/api/report/weekly', async () => {
    const weekMs = 7 * 24 * 3600 * 1000;
    const since = new Date(Date.now() - weekMs);

    const [snapshot, content, leads, approvals] = await Promise.all([
      collectAnalytics(ctx),
      ctx.store.listContent(DEFAULT_TENANT_ID),
      ctx.store.listLeads(DEFAULT_TENANT_ID),
      ctx.store.listApprovals(DEFAULT_TENANT_ID, 'pending'),
    ]);

    const publishedThisWeek = content.filter(
      (p) => p.status === 'published' && p.updatedAt >= since,
    );
    const publishedIds = new Set(publishedThisWeek.map((p) => p.id));
    const posts = snapshot.posts.filter((p) => publishedIds.has(p.pieceId));

    const totals: Record<string, number> = {};
    for (const post of posts) {
      for (const [name, value] of Object.entries(post.metrics)) {
        totals[name] = (totals[name] ?? 0) + value;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = await ctx.store.listCalendar(DEFAULT_TENANT_ID, today);
    const { buildRecommendations } = await import('../pipeline/analyst.js');

    return {
      generatedAt: new Date().toISOString(),
      since: since.toISOString(),
      published: posts,
      totals,
      newLeads: leads.filter((l) => l.createdAt >= since).length,
      pendingApprovals: approvals.length,
      upcomingSlots: upcoming.map((s) => ({
        date: s.date,
        time: s.time,
        format: s.format,
        pillar: s.pillar,
        funnel: s.funnel,
        topic: s.topic,
        status: s.status,
      })),
      recommendations: await buildRecommendations(ctx),
    };
  });
}
