import { logger } from '@empleado/shared';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';
import { collectAnalytics } from '../routes/analytics.js';

/**
 * Aprendizaje del sistema (Fase 5 — spec §12 Analista): ranking determinista de
 * pilares combinando rendimiento real (interacciones promedio por pilar) y
 * preferencias del cliente (aprobados − rechazados). Fórmula explicable, no un
 * LLM opinando sobre números. Los pilares sin datos conservan el orden de la
 * estrategia de marca: sin datos no hay opinión.
 */
export interface PillarScore {
  pillar: string;
  avgInteractions: number | null;
  approved: number;
  rejected: number;
  score: number | null;
}

export async function rankPillars(ctx: AppContext, brandPillars: string[]): Promise<{
  ranking: string[];
  scores: PillarScore[];
}> {
  const scores = new Map<string, PillarScore>(
    brandPillars.map((p) => [p, { pillar: p, avgInteractions: null, approved: 0, rejected: 0, score: null }]),
  );

  try {
    const analytics = await collectAnalytics(ctx);
    const byPillar = new Map<string, number[]>();
    for (const post of analytics.posts) {
      const interactions = post.metrics['total_interactions'];
      if (interactions === undefined) continue;
      byPillar.set(post.pillar, [...(byPillar.get(post.pillar) ?? []), interactions]);
    }
    for (const [pillar, values] of byPillar) {
      const entry = scores.get(pillar);
      if (entry) entry.avgInteractions = values.reduce((a, b) => a + b, 0) / values.length;
    }

    const feedback = await ctx.store.feedbackStatsByPillar(DEFAULT_TENANT_ID);
    for (const f of feedback) {
      const entry = scores.get(f.pillar);
      if (entry) {
        entry.approved = f.approved;
        entry.rejected = f.rejected;
      }
    }
  } catch (err) {
    logger.warn({ err }, 'Ranking de pilares: sin datos suficientes, se usa el orden de marca');
  }

  // Puntuación: interacciones promedio + 2 puntos por aprobación neta.
  for (const entry of scores.values()) {
    const net = entry.approved - entry.rejected;
    if (entry.avgInteractions !== null || entry.approved + entry.rejected > 0) {
      entry.score = (entry.avgInteractions ?? 0) + net * 2;
    }
  }

  // Con datos: mejor puntuación primero. Sin datos: orden de marca, al final no —
  // intercalados tras los puntuados para que sigan recibiendo oportunidades.
  const withData = [...scores.values()].filter((s) => s.score !== null);
  const withoutData = brandPillars.filter((p) => scores.get(p)?.score === null);
  withData.sort((a, b) => b.score! - a.score!);

  return {
    ranking: [...withData.map((s) => s.pillar), ...withoutData],
    scores: [...scores.values()],
  };
}
