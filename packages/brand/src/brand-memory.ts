import type { KnowledgeVerification } from '@empleado/shared';

/**
 * Brand Memory (spec §17): memoria estructurada de marca. No es "un prompt gigante";
 * es información estructurada que los agentes consultan de forma contextual.
 * El nicho es configuración, no código duro (spec §6).
 */
export interface BrandMemory {
  tenantId: string;
  brandName: string;
  employeeName?: string;
  description: string;
  sector: string;
  niche: string;
  market: string;
  services: string[];
  differentiators: string[];
  audience: AudienceProfile;
  voice: BrandVoice;
  /** Disclaimers configurables por industria (spec §28). */
  disclaimers: string[];
  competitors: string[];
  faq: Array<{ question: string; answer: string; verification: KnowledgeVerification }>;
  contentPillars: string[];
}

export interface AudienceProfile {
  segments: string[];
  painPoints: string[];
  goals: string[];
  /**
   * Audiencia objetivo declarativa (a quién le hablamos). Alimenta la generación
   * de contenido — tono, temas, ejemplos — NUNCA targeting de engagement hacia
   * terceros (nivel 4 del documento rector).
   */
  location?: string;
  ageRange?: string;
  interests?: string[];
}

export interface BrandVoice {
  tone: string;
  allowedWords: string[];
  prohibitedWords: string[];
  approvedClaims: string[];
  languageCode: string; // p. ej. "es-CO"
}

/** Repositorio abstracto; la implementación PostgreSQL vive en apps/api. */
export interface BrandMemoryRepository {
  get(tenantId: string): Promise<BrandMemory | null>;
  save(memory: BrandMemory): Promise<void>;
}

/**
 * Serializa el contexto de marca relevante para un prompt de generación.
 * Recuperación selectiva: solo lo necesario para la tarea (spec §17, §47).
 */
export function brandContextForPrompt(memory: BrandMemory): string {
  return [
    `Marca: ${memory.brandName} (${memory.sector} / ${memory.niche}, mercado: ${memory.market}).`,
    `Descripción: ${memory.description}`,
    `Servicios: ${memory.services.join('; ')}.`,
    `Diferenciadores: ${memory.differentiators.join('; ')}.`,
    `Audiencia: ${memory.audience.segments.join('; ')}. Dolores: ${memory.audience.painPoints.join('; ')}.`,
    [
      memory.audience.location ? `Ubicación de la audiencia: ${memory.audience.location}.` : '',
      memory.audience.ageRange ? `Rango de edad: ${memory.audience.ageRange}.` : '',
      memory.audience.interests?.length
        ? `Intereses/temas afines: ${memory.audience.interests.join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' '),
    `Tono: ${memory.voice.tone}. Idioma: ${memory.voice.languageCode}.`,
    memory.voice.prohibitedWords.length
      ? `Palabras PROHIBIDAS (no usar nunca): ${memory.voice.prohibitedWords.join(', ')}.`
      : '',
    memory.disclaimers.length ? `Disclaimers obligatorios: ${memory.disclaimers.join(' | ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
