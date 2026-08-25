import type { BrandMemory } from '@empleado/brand';
import type { ContentPiece } from './content-piece.js';

/**
 * Quality Gate (spec §46): controles previos a publicar.
 * No se publica el primer resultado de un LLM (spec §45).
 * Checks deterministas aquí; los checks que requieren juicio (fact-checking profundo,
 * calidad editorial) los ejecuta el agente Auditor vía IA y se suman como resultados.
 */
export interface QualityCheckResult {
  check: string;
  passed: boolean;
  detail?: string;
}

export interface QualityGateReport {
  passed: boolean;
  results: QualityCheckResult[];
}

export interface QualityGateOptions {
  /** Piezas recientes para detectar duplicación (spec §46 Duplication). */
  recentPieces?: Pick<ContentPiece, 'topic' | 'hook'>[];
}

/**
 * Frases y estructuras típicas de "AI slop" en español. Un caption que suena a IA
 * pierde autenticidad justo en el canal (Instagram) donde eso más se nota.
 */
const AI_SLOP_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'raya larga (—)', regex: /—/ },
  { label: '"es importante destacar/mencionar/señalar/resaltar"', regex: /es importante (destacar|mencionar|señalar|resaltar)/i },
  { label: '"cabe destacar/mencionar/resaltar/señalar"', regex: /cabe (destacar|mencionar|resaltar|señalar)/i },
  { label: '"en el mundo actual/de hoy"', regex: /en el mundo (actual|de hoy)/i },
  { label: '"en un mundo cada vez más / donde"', regex: /en un mundo (cada vez más|donde)/i },
  { label: '"a fin de cuentas" / "al final del día"', regex: /(a fin de cuentas|al final del día)/i },
  { label: '"sin duda alguna"', regex: /sin duda alguna/i },
  { label: '"en resumen" / "en pocas palabras"', regex: /(en resumen|en pocas palabras)[:,]/i },
  { label: '"profundicemos" / "adentrémonos"', regex: /(profundicemos|adentrémonos)/i },
  { label: '"cambio de juego" (game changer)', regex: /cambio de juego/i },
  { label: '"un sinfín de"', regex: /un sinfín de/i },
];

export function runQualityGate(
  piece: ContentPiece,
  brand: BrandMemory,
  options: QualityGateOptions = {},
): QualityGateReport {
  const results: QualityCheckResult[] = [];

  // Brand consistency: palabras prohibidas.
  const fullText = `${piece.hook}\n${piece.body}\n${piece.cta}`.toLowerCase();
  const violations = brand.voice.prohibitedWords.filter((w) => fullText.includes(w.toLowerCase()));
  results.push({
    check: 'prohibited_words',
    passed: violations.length === 0,
    ...(violations.length ? { detail: `Contiene palabras prohibidas: ${violations.join(', ')}` } : {}),
  });

  // Compliance: sectores regulados requieren disclaimer en contenido BOFU/educativo con claims.
  const needsDisclaimer = brand.disclaimers.length > 0;
  const hasDisclaimer = brand.disclaimers.some((d) => piece.body.includes(d));
  results.push({
    check: 'disclaimer',
    passed: !needsDisclaimer || hasDisclaimer,
    ...(needsDisclaimer && !hasDisclaimer
      ? { detail: 'El contenido no incluye el disclaimer configurado por la marca.' }
      : {}),
  });

  // CTA coherente: existe y no está vacío.
  results.push({
    check: 'cta_present',
    passed: piece.cta.trim().length > 0,
    ...(piece.cta.trim().length === 0 ? { detail: 'La pieza no tiene CTA.' } : {}),
  });

  // Estructura mínima: hook y cuerpo con contenido real.
  results.push({
    check: 'structure',
    passed: piece.hook.trim().length >= 10 && piece.body.trim().length >= 50,
    detail: 'Hook >= 10 caracteres y cuerpo >= 50 caracteres.',
  });

  // Duplicación: mismo topic+hook que piezas recientes.
  const duplicated = (options.recentPieces ?? []).some(
    (p) => p.topic === piece.topic && p.hook.trim().toLowerCase() === piece.hook.trim().toLowerCase(),
  );
  results.push({
    check: 'duplication',
    passed: !duplicated,
    ...(duplicated ? { detail: 'Contenido duplicado respecto a piezas recientes.' } : {}),
  });

  // AI slop: frases y estructuras que delatan texto generado por IA sin edición.
  const slopMatches = AI_SLOP_PATTERNS.filter((p) => p.regex.test(fullText)).map((p) => p.label);
  results.push({
    check: 'no_ai_slop',
    passed: slopMatches.length === 0,
    ...(slopMatches.length ? { detail: `Suena a texto generado por IA sin editar: ${slopMatches.join(', ')}` } : {}),
  });

  // Mock guard (spec §57): contenido marcado como simulado jamás avanza hacia publicación.
  const isMock = fullText.includes('[mock]');
  results.push({
    check: 'no_mock_content',
    passed: !isMock,
    ...(isMock ? { detail: 'La pieza contiene contenido simulado ([MOCK]); no puede publicarse.' } : {}),
  });

  // Límite de caption de Instagram (2.200 caracteres): hook + cuerpo + CTA.
  // Detectarlo aquí evita el error 36004 de Meta en plena publicación.
  const captionLength = [piece.hook, piece.body, piece.cta].filter(Boolean).join('\n\n').length;
  results.push({
    check: 'caption_length',
    passed: captionLength <= 2200,
    ...(captionLength > 2200
      ? {
          detail: `El caption tiene ${captionLength} caracteres y el límite de Instagram es 2.200: recorta el cuerpo (en carruseles, los puntos ya van en las láminas).`,
        }
      : {}),
  });

  // Pilar válido según la estrategia de la marca.
  results.push({
    check: 'valid_pillar',
    passed: brand.contentPillars.includes(piece.pillar),
    ...(!brand.contentPillars.includes(piece.pillar)
      ? { detail: `Pilar "${piece.pillar}" no pertenece a la estrategia (${brand.contentPillars.join(', ')})` }
      : {}),
  });

  return { passed: results.every((r) => r.passed), results };
}
