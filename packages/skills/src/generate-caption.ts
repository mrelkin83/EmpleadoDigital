import { randomUUID } from 'node:crypto';
import type { TaskRouter } from '@empleado/ai-core';
import { brandContextForPrompt, type BrandMemory } from '@empleado/brand';
import type { ContentFormat, ContentPiece, FunnelStage } from '@empleado/content';

/**
 * Skill: generate_caption (spec §13). Genera un borrador de pieza de contenido.
 * El resultado SIEMPRE entra en estado 'draft' y debe pasar el Quality Gate y la
 * matriz de aprobación antes de publicarse (spec §45).
 */
export interface GenerateCaptionInput {
  tenantId: string;
  brand: BrandMemory;
  pillar: string;
  funnel: FunnelStage;
  topic: string;
  format: ContentFormat;
  /** Motivos de rechazos recientes del cliente: preferencias aprendidas (D24). */
  rejectionFeedback?: string[];
  /** Para variantes: hook existente del que la nueva versión debe diferenciarse. */
  avoidSimilarTo?: string;
}

export async function generateCaption(
  router: TaskRouter,
  input: GenerateCaptionInput,
): Promise<ContentPiece> {
  const system = [
    'Eres el copywriter de un empleado digital de marketing. Escribes contenido para Instagram.',
    'Contexto de marca:',
    brandContextForPrompt(input.brand),
    'Reglas: no inventes leyes ni artículos; no prometas resultados; el contenido educativo lleva el disclaimer de la marca al final del cuerpo.',
    'El caption completo (hook + cuerpo + CTA) debe quedar por debajo de 1.800 caracteres (límite de Instagram: 2.200). En carruseles el cuerpo es un resumen: los puntos detallados van en las láminas.',
    input.rejectionFeedback?.length
      ? `Preferencias aprendidas — el cliente rechazó piezas anteriores por estos motivos, evítalos: ${input.rejectionFeedback.join(' | ')}`
      : '',
    'Responde SOLO con JSON: {"hook": string, "body": string, "cta": string}',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = [
    `Crea el contenido para una publicación tipo "${input.format}" del pilar "${input.pillar}" (etapa ${input.funnel}) sobre el tema: ${input.topic}`,
    input.avoidSimilarTo
      ? `Es una VARIANTE: usa un ángulo y un hook claramente distintos a este: "${input.avoidSimilarTo}"`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const result = await router.run({
    tenantId: input.tenantId,
    taskType: 'copywriting',
    input: { system, prompt, maxTokens: 2048 },
  });

  const parsed = parseCaptionJson(result.text);
  const now = new Date();

  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    format: input.format,
    pillar: input.pillar,
    funnel: input.funnel,
    topic: input.topic,
    hook: parsed.hook,
    body: parsed.body,
    cta: parsed.cta,
    status: 'draft',
    approval: 'pending',
    generatedBy: { provider: result.provider, model: result.model },
    createdAt: now,
    updatedAt: now,
  };
}

export function parseCaptionJson(text: string): { hook: string; body: string; cta: string } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text.slice(text.indexOf('{'));
  try {
    const obj = JSON.parse(candidate) as { hook?: unknown; body?: unknown; cta?: unknown };
    return {
      hook: typeof obj.hook === 'string' ? obj.hook : '',
      body: typeof obj.body === 'string' ? obj.body : '',
      cta: typeof obj.cta === 'string' ? obj.cta : '',
    };
  } catch {
    // Salida no estructurada (p. ej. MockProvider): se conserva como cuerpo para revisión humana.
    return { hook: '', body: text.trim(), cta: '' };
  }
}
