import type { BrandMemory } from './brand-memory.js';

/**
 * Perfil del caso piloto (spec §5): abogado colombiano de derecho aduanero.
 * Es CONFIGURACIÓN de ejemplo/seed — el producto no se codifica para abogados (spec §5-6).
 */
export function buildPilotBrandMemory(tenantId: string): BrandMemory {
  return {
    tenantId,
    brandName: 'Asesoría Aduanera (piloto)',
    description:
      'Profesional colombiano especializado en derecho aduanero, comercio exterior, importaciones y procesos ante la DIAN.',
    sector: 'Servicios jurídicos',
    niche: 'Derecho aduanero y comercio exterior',
    market: 'Colombia',
    services: [
      'Asesoría en importaciones y compras internacionales',
      'Defensa en aprehensión o retención de mercancías',
      'Respuesta a requerimientos de la DIAN',
      'Acompañamiento en operaciones de importación desde China y Estados Unidos',
    ],
    differentiators: [
      'Especialización exclusiva en aduanas y comercio exterior',
      'Enfoque preventivo: evitar el problema antes de importar',
    ],
    audience: {
      segments: [
        'Importadores y comerciantes',
        'Empresarios con operaciones de comercio exterior',
        'Personas o empresas requeridas por la DIAN',
        'Personas con mercancía aprehendida o retenida',
      ],
      painPoints: [
        'Mercancía retenida o aprehendida sin saber qué hacer',
        'Requerimientos aduaneros con plazos cortos',
        'Errores costosos al importar por primera vez',
        'Desconocimiento de la normativa aduanera colombiana',
      ],
      goals: ['Recuperar su mercancía', 'Importar sin sanciones', 'Responder correctamente a la DIAN'],
    },
    voice: {
      tone: 'Profesional, claro y cercano; educa sin tecnicismos innecesarios; genera confianza sin prometer resultados.',
      allowedWords: [],
      prohibitedWords: ['garantizamos ganar', '100% seguro', 'truco legal', 'evadir'],
      approvedClaims: [],
      languageCode: 'es-CO',
    },
    disclaimers: [
      'Contenido informativo. Para evaluar su caso particular consulte a un profesional.',
    ],
    competitors: [],
    faq: [],
    contentPillars: [
      'Educación',
      'Prevención',
      'Errores frecuentes',
      'Casos',
      'Actualidad',
      'Preguntas frecuentes',
      'Mitos',
      'Consejos prácticos',
      'Autoridad profesional',
      'Conversión',
    ],
  };
}
