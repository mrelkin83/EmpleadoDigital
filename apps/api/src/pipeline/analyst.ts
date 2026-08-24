import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';
import { collectAnalytics } from '../routes/analytics.js';

/**
 * Agente Analista (spec §12, Fase 2): interpreta datos reales y produce
 * recomendaciones accionables. Siguiendo D14, las reglas son deterministas y
 * viven en código — nada de conclusiones inventadas por un LLM sobre datos que
 * puede malinterpretar. Se calculan bajo demanda: siempre actuales, cero ruido
 * en la bitácora.
 */
export interface Recommendation {
  id: string;
  priority: 'alta' | 'media' | 'baja';
  title: string;
  detail: string;
}

const DAY_MS = 24 * 3600 * 1000;

export async function buildRecommendations(ctx: AppContext): Promise<Recommendation[]> {
  const recs: Recommendation[] = [];
  const content = await ctx.store.listContent(DEFAULT_TENANT_ID);
  const today = new Date().toISOString().slice(0, 10);
  const calendar = await ctx.store.listCalendar(DEFAULT_TENANT_ID, today);

  const published = content.filter((p) => p.status === 'published');
  const failed = content.filter((p) => p.status === 'failed');
  const approvedIdle = content.filter((p) => p.status === 'approved');
  const draftsIdle = content.filter((p) => p.status === 'draft');

  // 1. Piezas fallidas: lo más urgente, hay trabajo aprobado que no salió.
  if (failed.length > 0) {
    recs.push({
      id: 'failed-pieces',
      priority: 'alta',
      title: `${failed.length} pieza(s) programada(s) fallaron`,
      detail: 'Revisa la bitácora para ver la causa, corrige y reprográmalas.',
    });
  }

  // 2. Ritmo de publicación (spec §20: consistencia ante todo).
  const lastPublished = published
    .map((p) => p.updatedAt.getTime())
    .sort((a, b) => b - a)[0];
  if (!lastPublished) {
    recs.push({
      id: 'no-posts',
      priority: 'alta',
      title: 'Aún no hay publicaciones',
      detail: 'Publica la primera pieza para empezar a acumular datos reales.',
    });
  } else if (Date.now() - lastPublished > 3 * DAY_MS) {
    const days = Math.floor((Date.now() - lastPublished) / DAY_MS);
    recs.push({
      id: 'publishing-gap',
      priority: 'alta',
      title: `Llevas ${days} días sin publicar`,
      detail: 'La consistencia pesa más que la perfección: programa la siguiente pieza.',
    });
  }

  // 3. Calendario sin plan hacia adelante.
  const plannedAhead = calendar.filter((s) => s.status === 'planned');
  if (plannedAhead.length === 0) {
    recs.push({
      id: 'no-calendar',
      priority: 'media',
      title: 'No hay calendario planificado',
      detail: 'Usa "Planificar próxima semana" para generar el mix TOFU/MOFU/BOFU.',
    });
  } else {
    const pending = plannedAhead.filter((s) => s.topic.startsWith('Por definir'));
    if (pending.length > 0) {
      recs.push({
        id: 'topics-pending',
        priority: 'media',
        title: `${pending.length} slot(s) del calendario sin tema`,
        detail: 'Define los temas pendientes (o edita el slot) para poder generar sus borradores.',
      });
    }
  }

  // 4. Trabajo atascado en el embudo interno.
  if (approvedIdle.length > 0) {
    recs.push({
      id: 'approved-idle',
      priority: 'media',
      title: `${approvedIdle.length} pieza(s) aprobada(s) sin programar`,
      detail: 'Ya pasaron tu aprobación: súbeles imagen si falta y prográmalas.',
    });
  }
  if (draftsIdle.length >= 3) {
    recs.push({
      id: 'drafts-piling',
      priority: 'baja',
      title: `${draftsIdle.length} borradores esperando revisión`,
      detail: 'Revísalos y envía a aprobación los que valgan; descarta el resto.',
    });
  }

  // 5. Qué contenido funciona (necesita al menos 2 posts con métricas para comparar).
  const analytics = await collectAnalytics(ctx);
  const withMetrics = analytics.posts.filter((p) => (p.metrics['total_interactions'] ?? 0) > 0);
  if (withMetrics.length >= 2) {
    const best = [...withMetrics].sort(
      (a, b) => (b.metrics['total_interactions'] ?? 0) - (a.metrics['total_interactions'] ?? 0),
    )[0]!;
    recs.push({
      id: 'best-pillar',
      priority: 'media',
      title: `El pilar "${best.pillar}" es el que mejor rinde`,
      detail: `"${best.hook || best.topic}" lidera con ${best.metrics['total_interactions']} interacciones: produce más contenido de ese pilar.`,
    });
  } else if (published.length > 0 && published.length < 3) {
    recs.push({
      id: 'few-datapoints',
      priority: 'baja',
      title: 'Pocos datos todavía para comparar contenidos',
      detail: 'Con 3+ publicaciones el analista podrá decirte qué pilares y formatos rinden mejor.',
    });
  }

  // 6. Mix de funnel de lo publicado reciente (regla 3/2/1 del spec §20).
  const recent = published.slice(0, 6);
  if (recent.length >= 4 && !recent.some((p) => p.funnel === 'BOFU')) {
    recs.push({
      id: 'no-bofu',
      priority: 'media',
      title: 'Sin contenido BOFU reciente',
      detail: 'Las últimas publicaciones no incluyen conversión: agrega una pieza BOFU al plan.',
    });
  }

  const order = { alta: 0, media: 1, baja: 2 } as const;
  return recs.sort((a, b) => order[a.priority] - order[b.priority]);
}
