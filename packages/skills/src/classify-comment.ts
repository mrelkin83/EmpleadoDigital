import type { TaskRouter } from '@empleado/ai-core';

/**
 * Skill: classify_comment (spec §26). Clasifica interacciones en categorías
 * accionables. Detecta leads y casos que requieren escalamiento humano (spec §27).
 */
export type CommentCategory =
  | 'consulta'
  | 'lead'
  | 'cliente'
  | 'queja'
  | 'spam'
  | 'troll'
  | 'riesgo_reputacional'
  | 'pregunta_tecnica'
  | 'solicitud_comercial';

export interface CommentClassification {
  category: CommentCategory;
  requiresHuman: boolean;
  suggestedResponse?: string;
}

const VALID_CATEGORIES: CommentCategory[] = [
  'consulta',
  'lead',
  'cliente',
  'queja',
  'spam',
  'troll',
  'riesgo_reputacional',
  'pregunta_tecnica',
  'solicitud_comercial',
];

/** Categorías que SIEMPRE escalan a humano, independiente de lo que diga el modelo (spec §27). */
const ALWAYS_HUMAN: CommentCategory[] = ['queja', 'riesgo_reputacional', 'pregunta_tecnica'];

export async function classifyComment(
  router: TaskRouter,
  tenantId: string,
  commentText: string,
): Promise<CommentClassification> {
  const result = await router.run({
    tenantId,
    taskType: 'classification',
    input: {
      system: [
        'Clasifica comentarios de Instagram de una cuenta profesional.',
        `Categorías válidas: ${VALID_CATEGORIES.join(', ')}.`,
        'Responde SOLO con JSON: {"category": string, "requiresHuman": boolean}',
      ].join('\n'),
      prompt: `Comentario: "${commentText}"`,
      maxTokens: 256,
    },
  });

  const parsed = safeParse(result.text);
  const category = parsed.category;
  // La política del producto manda sobre el modelo: ciertas categorías siempre escalan.
  const requiresHuman = parsed.requiresHuman || ALWAYS_HUMAN.includes(category);
  return { category, requiresHuman };
}

function safeParse(text: string): { category: CommentCategory; requiresHuman: boolean } {
  try {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
    const obj = JSON.parse(fenced?.[1] ?? text.slice(text.indexOf('{'))) as {
      category?: unknown;
      requiresHuman?: unknown;
    };
    const category = VALID_CATEGORIES.includes(obj.category as CommentCategory)
      ? (obj.category as CommentCategory)
      : 'consulta';
    return { category, requiresHuman: obj.requiresHuman === true };
  } catch {
    // Si la clasificación falla, se trata como consulta y se escala a humano (fallback seguro, spec §94).
    return { category: 'consulta', requiresHuman: true };
  }
}
