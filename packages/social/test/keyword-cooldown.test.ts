import { describe, expect, it } from 'vitest';
import { CooldownService, KeywordMatcher, type KeywordRule } from '@empleado/social';

function rule(overrides: Partial<KeywordRule> = {}): KeywordRule {
  return {
    id: 'r1',
    keyword: 'info',
    aliases: ['información'],
    matchType: 'word_boundary',
    priority: 1,
    enabled: true,
    cooldownMinutes: 60,
    responseTemplate: 'Hola {{username}}, te escribo por DM.',
    ...overrides,
  };
}

describe('KeywordMatcher', () => {
  it('matchea por word boundary sin falsos positivos', () => {
    const m = new KeywordMatcher();
    m.load([rule()]);
    expect(m.match('quiero INFO por favor')?.id).toBe('r1');
    expect(m.match('informe anual')).toBeNull(); // "info" dentro de otra palabra no matchea
  });

  it('respeta prioridad y aliases', () => {
    const m = new KeywordMatcher();
    m.load([
      rule({ id: 'baja', keyword: 'asesoria', priority: 10, matchType: 'contains' }),
      rule({ id: 'alta', keyword: 'urgente', priority: 1, matchType: 'contains' }),
    ]);
    expect(m.match('asesoria urgente')?.id).toBe('alta');
    const m2 = new KeywordMatcher();
    m2.load([rule()]);
    expect(m2.match('necesito información')?.id).toBe('r1');
  });

  it('ignora reglas deshabilitadas', () => {
    const m = new KeywordMatcher();
    m.load([rule({ enabled: false })]);
    expect(m.match('info')).toBeNull();
  });
});

describe('CooldownService', () => {
  it('aplica cooldown por usuario+regla', () => {
    const c = new CooldownService();
    expect(c.isOnCooldown('u1', 'r1', 60)).toBe(false);
    c.recordTrigger('u1', 'r1');
    expect(c.isOnCooldown('u1', 'r1', 60)).toBe(true);
    expect(c.isOnCooldown('u2', 'r1', 60)).toBe(false);
  });

  it('limita DMs por hora por usuario', () => {
    const c = new CooldownService({ maxDmsPerHourPerUser: 2 });
    c.recordTrigger('u1', 'r1');
    c.recordTrigger('u1', 'r2');
    expect(c.isRateLimited('u1')).toBe(true);
    expect(c.isRateLimited('u2')).toBe(false);
  });
});
