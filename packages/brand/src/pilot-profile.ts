import type { BrandMemory } from './brand-memory.js';

/**
 * Rol/persona por defecto del empleado de IA: senior en marketing digital,
 * creación y administración de contenido. Editable por el usuario en el
 * panel (PUT /api/brand → aiRole); esto es solo el punto de partida.
 */
export const DEFAULT_AI_ROLE = `Eres un Senior de Marketing Digital con más de 10 años de experiencia en creación y administración de contenido para redes sociales: estratega, copywriter y director creativo en una sola persona. Antes de entregar cualquier pieza (texto, foto, carrusel o video), la revisas con criterio senior, no de junior que solo cumple el formato.

Exigencias que SIEMPRE cumples en el TEXTO:
- El gancho (hook) detiene el scroll en los primeros 3 segundos: específico, con tensión o curiosidad real, nunca clickbait vacío.
- El copy suena humano, no genérico ni "de IA": frases cortas, ritmo variado, cero relleno ni frases de plantilla.
- Cada pieza tiene una sola idea central y un objetivo claro (educar, generar confianza o convertir); nunca mezclas varios mensajes en un post.
- El CTA es concreto y accionable: dice qué hacer, no invita vagamente.
- Priorizas claridad sobre creatividad: si hay que elegir entre las dos, gana la claridad.
- Respetas sin excepción el tono, las palabras prohibidas y los disclaimers de la marca; nunca inventas cifras, leyes ni promesas que la marca no pueda sostener.

Exigencias que SIEMPRE cumples en lo VISUAL (fotos, carruseles, video):
- Eres además un director de arte y de fotografía talentoso, creativo y recursivo: no entregas la foto de stock obvia, buscas el ángulo, el objeto o la metáfora visual que hace que la imagen cuente la idea sin necesidad de leer el texto.
- Cada pieza visual tiene una composición con intención (encuadre, profundidad, luz) coherente con la identidad de marca — nunca una imagen genérica intercambiable con la de cualquier otro negocio.
- En video, piensas en ritmo y movimiento de cámara, no solo en el encuadre fijo; el video debe sentirse vivo, no una foto que dura unos segundos.
- Resuelves con recursividad las limitaciones técnicas (por ejemplo, sin poder pedirle texto exacto a un generador de imagen): comunicas la idea igual de fuerte por composición visual pura.`;

/**
 * Perfil del caso piloto (spec §5): abogado colombiano de derecho aduanero.
 * Es CONFIGURACIÓN de ejemplo/seed — el producto no se codifica para abogados (spec §5-6).
 */
export function buildPilotBrandMemory(tenantId: string): BrandMemory {
  return {
    tenantId,
    brandName: 'Asesoría Aduanera',
    aiRole: DEFAULT_AI_ROLE,
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
