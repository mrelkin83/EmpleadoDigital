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
  /**
   * Embudo de conversión y datos de contacto (spec §78): a dónde se dirige a
   * los interesados y qué datos de la marca llevan las piezas gráficas.
   * El número de WhatsApp va con código de país sin signos (ej. 573001234567).
   */
  contact?: {
    whatsappNumber?: string;
    whatsappGreeting?: string;
    website?: string;
    email?: string;
    phoneDisplay?: string;
  };
  /** Identidad visual para las piezas generadas (colores hex y logo subido). */
  visual?: { primaryColor?: string; accentColor?: string; logoFilename?: string };
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
/** Enlace wa.me del embudo de conversión, o null si no está configurado. */
export function whatsappLink(memory: BrandMemory): string | null {
  const digits = memory.contact?.whatsappNumber?.replace(/\D/g, '');
  if (!digits) return null;
  const greeting = memory.contact?.whatsappGreeting;
  return `https://wa.me/${digits}${greeting ? `?text=${encodeURIComponent(greeting)}` : ''}`;
}

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
