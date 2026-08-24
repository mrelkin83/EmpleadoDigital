import { randomUUID } from 'node:crypto';
import type { TaskRouter } from '@empleado/ai-core';
import { brandContextForPrompt, type BrandMemory } from '@empleado/brand';
import {
  WEEKLY_FUNNEL_MIX,
  type CalendarSlot,
  type ContentFormat,
  type FunnelStage,
} from '@empleado/content';
import { logger } from '@empleado/shared';

/**
 * Skill: generate_content_calendar (spec §13, §44).
 * Planificador semanal en dos capas:
 * 1) Estructura DETERMINISTA por reglas: distribución de funnel (spec §20, mayoría
 *    TOFU/MOFU), rotación de pilares y formatos. Nunca depende del LLM para cumplir reglas.
 * 2) Temas sugeridos por IA cuando hay proveedor real; si la sugerencia no es utilizable,
 *    el tema queda explícitamente "Por definir" para revisión humana (spec §57: nada simulado).
 */
export interface PlanWeekInput {
  tenantId: string;
  brand: BrandMemory;
  /** Lunes de la semana a planificar, formato YYYY-MM-DD. */
  weekStart: string;
  /** Hora local de publicación por defecto. */
  defaultTime?: string;
}

const FORMAT_ROTATION: ContentFormat[] = ['reel', 'carousel', 'image', 'carousel', 'reel', 'image'];

export async function planWeek(router: TaskRouter, input: PlanWeekInput): Promise<CalendarSlot[]> {
  const { brand } = input;

  // Distribución de funnel de la semana: TOFU 3, MOFU 2, BOFU 1 (spec §20).
  const funnelSequence: FunnelStage[] = ['TOFU', 'MOFU', 'TOFU', 'BOFU', 'MOFU', 'TOFU'];
  const expected = funnelSequence.length;

  // Rotación de pilares: BOFU usa el pilar de conversión si existe; el resto rota.
  const conversionPillar = brand.contentPillars.find((p) => /conversi/i.test(p));
  const educationalPillars = brand.contentPillars.filter((p) => p !== conversionPillar);

  const topics = await suggestTopics(router, input, funnelSequence).catch((err) => {
    logger.warn({ err }, 'Sugerencia de temas no disponible; los temas quedan por definir');
    return [] as string[];
  });

  const slots: CalendarSlot[] = [];
  let pillarIdx = 0;
  for (let day = 0; day < expected; day++) {
    const funnel = funnelSequence[day]!;
    const pillar =
      funnel === 'BOFU' && conversionPillar
        ? conversionPillar
        : educationalPillars[pillarIdx++ % Math.max(educationalPillars.length, 1)] ??
          brand.contentPillars[0] ??
          'Educación';

    const date = addDays(input.weekStart, day);
    slots.push({
      id: randomUUID(),
      tenantId: input.tenantId,
      date,
      time: input.defaultTime ?? '11:00',
      format: FORMAT_ROTATION[day % FORMAT_ROTATION.length]!,
      pillar,
      funnel,
      topic: topics[day] ?? `Por definir — pilar ${pillar}`,
      objective: objectiveFor(funnel),
      channel: 'instagram',
      status: 'planned',
    });
  }

  // Verificación interna del mix (regla WEEKLY_FUNNEL_MIX); si alguien cambia la
  // secuencia sin actualizar la regla, fallamos ruidosamente en tests.
  const bofuCount = slots.filter((s) => s.funnel === 'BOFU').length;
  if (bofuCount > WEEKLY_FUNNEL_MIX.BOFU) {
    logger.warn({ bofuCount }, 'El plan semanal excede el máximo de contenido de conversión');
  }

  return slots;
}

/** Pide a la IA temas concretos por slot; devuelve [] si la salida no es utilizable. */
async function suggestTopics(
  router: TaskRouter,
  input: PlanWeekInput,
  funnels: FunnelStage[],
): Promise<string[]> {
  const result = await router.run({
    tenantId: input.tenantId,
    taskType: 'complex_planning',
    input: {
      system: [
        'Eres el content planner de un empleado digital de marketing.',
        brandContextForPrompt(input.brand),
        `Responde SOLO con un array JSON de ${funnels.length} strings (un tema concreto por publicación, en el orden dado).`,
      ].join('\n'),
      prompt: `Propón temas para la semana que inicia ${input.weekStart}. Etapas del funnel en orden: ${funnels.join(', ')}. No antepongas la etapa ni el pilar al tema: solo el tema.`,
      maxTokens: 1024,
    },
  });

  try {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(result.text);
    const parsed = JSON.parse(fenced?.[1] ?? result.text.slice(result.text.indexOf('['))) as unknown;
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string' && !t.includes('[MOCK]'))) {
      return (parsed as string[]).map(cleanTopic);
    }
  } catch {
    // salida no estructurada → sin sugerencias
  }
  return [];
}

/** Quita prefijos de etapa ("TOFU — ", "MOFU: ") que la IA a veces antepone, y limita longitud. */
function cleanTopic(topic: string): string {
  return topic
    .replace(/^\s*(?:TOFU|MOFU|BOFU)\s*[—–:-]\s*/i, '')
    .trim()
    .slice(0, 200);
}

function objectiveFor(funnel: FunnelStage): string {
  switch (funnel) {
    case 'TOFU':
      return 'Alcance y descubrimiento de audiencia relevante';
    case 'MOFU':
      return 'Educación y construcción de confianza';
    case 'BOFU':
      return 'Generar consultas y conversaciones comerciales';
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
