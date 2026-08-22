import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPilotBrandMemory } from '@empleado/brand';
import { canTransition, runQualityGate, validateWeeklyMix, type CalendarSlot, type ContentPiece } from '@empleado/content';

const brand = buildPilotBrandMemory('t1');
const DISCLAIMER = brand.disclaimers[0]!;

function piece(overrides: Partial<ContentPiece> = {}): ContentPiece {
  const now = new Date();
  return {
    id: randomUUID(),
    tenantId: 't1',
    format: 'carousel',
    pillar: 'Prevención',
    funnel: 'TOFU',
    topic: 'Errores al importar desde China',
    hook: '¿Vas a importar desde China? Evita estos 5 errores.',
    body:
      'Muchos importadores pierden su mercancía por errores evitables en la declaración de importación. ' +
      'Aquí los cinco más comunes y cómo prevenirlos. ' +
      DISCLAIMER,
    cta: 'Guarda este post y escríbenos si tienes dudas.',
    status: 'draft',
    approval: 'pending',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Quality Gate', () => {
  it('aprueba una pieza correcta', () => {
    const report = runQualityGate(piece(), brand);
    expect(report.passed).toBe(true);
  });

  it('rechaza palabras prohibidas de la marca', () => {
    const report = runQualityGate(piece({ body: `Te enseño un truco legal para evadir. ${DISCLAIMER}` }), brand);
    expect(report.passed).toBe(false);
    expect(report.results.find((r) => r.check === 'prohibited_words')?.passed).toBe(false);
  });

  it('exige el disclaimer configurado (sector regulado)', () => {
    const report = runQualityGate(
      piece({ body: 'Contenido educativo largo sobre aduanas sin el aviso correspondiente incluido aquí.' }),
      brand,
    );
    expect(report.results.find((r) => r.check === 'disclaimer')?.passed).toBe(false);
  });

  it('bloquea contenido [MOCK] (nunca se publica contenido simulado)', () => {
    const report = runQualityGate(piece({ body: `[MOCK] contenido simulado de prueba ${DISCLAIMER}` }), brand);
    expect(report.results.find((r) => r.check === 'no_mock_content')?.passed).toBe(false);
  });

  it('detecta duplicación contra piezas recientes', () => {
    const p = piece();
    const report = runQualityGate(p, brand, { recentPieces: [{ topic: p.topic, hook: p.hook }] });
    expect(report.results.find((r) => r.check === 'duplication')?.passed).toBe(false);
  });

  it('rechaza pilares fuera de la estrategia', () => {
    const report = runQualityGate(piece({ pillar: 'Chismes' }), brand);
    expect(report.results.find((r) => r.check === 'valid_pillar')?.passed).toBe(false);
  });
});

describe('flujo de estados de contenido', () => {
  it('impide publicar directamente desde idea o draft', () => {
    expect(canTransition('idea', 'published')).toBe(false);
    expect(canTransition('draft', 'published')).toBe(false);
    expect(canTransition('approved', 'published')).toBe(true);
    expect(canTransition('scheduled', 'published')).toBe(true);
  });
});

describe('calendario editorial', () => {
  it('detecta calendarios saturados de contenido de conversión', () => {
    const slot = (funnel: CalendarSlot['funnel']): CalendarSlot => ({
      id: randomUUID(),
      tenantId: 't1',
      date: '2026-08-24',
      time: '10:00',
      format: 'reel',
      pillar: 'Conversión',
      funnel,
      topic: 'x',
      objective: 'x',
      channel: 'instagram',
      status: 'planned',
    });
    expect(validateWeeklyMix([slot('BOFU'), slot('BOFU'), slot('TOFU')]).balanced).toBe(false);
    expect(validateWeeklyMix([slot('TOFU'), slot('TOFU'), slot('MOFU'), slot('BOFU')]).balanced).toBe(true);
  });
});
