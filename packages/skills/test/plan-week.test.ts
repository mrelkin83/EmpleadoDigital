import { describe, expect, it } from 'vitest';
import { InMemoryUsageSink, TaskRouter } from '@empleado/ai-core';
import { MockProvider } from '@empleado/ai-providers';
import { buildPilotBrandMemory } from '@empleado/brand';
import { validateWeeklyMix } from '@empleado/content';
import { planWeek } from '@empleado/skills';

const brand = buildPilotBrandMemory('t1');

function makeRouter(provider = new MockProvider()) {
  return { provider, router: new TaskRouter([provider], new InMemoryUsageSink()) };
}

describe('generate_content_calendar (planWeek)', () => {
  it('produce 6 slots con mix equilibrado (mayoría TOFU/MOFU, BOFU limitado)', async () => {
    const { router } = makeRouter();
    const slots = await planWeek(router, { tenantId: 't1', brand, weekStart: '2026-08-24' });
    expect(slots).toHaveLength(6);
    expect(slots.filter((s) => s.funnel === 'TOFU')).toHaveLength(3);
    expect(slots.filter((s) => s.funnel === 'MOFU')).toHaveLength(2);
    expect(slots.filter((s) => s.funnel === 'BOFU')).toHaveLength(1);
    expect(validateWeeklyMix(slots).balanced).toBe(true);
  });

  it('fechas consecutivas desde el lunes indicado y pilares de la estrategia', async () => {
    const { router } = makeRouter();
    const slots = await planWeek(router, { tenantId: 't1', brand, weekStart: '2026-08-24' });
    expect(slots[0]!.date).toBe('2026-08-24');
    expect(slots[5]!.date).toBe('2026-08-29');
    for (const s of slots) {
      expect(brand.contentPillars).toContain(s.pillar);
    }
    // El slot BOFU usa el pilar de conversión.
    expect(slots.find((s) => s.funnel === 'BOFU')?.pillar).toBe('Conversión');
  });

  it('usa temas sugeridos por la IA cuando la salida es utilizable', async () => {
    const { provider, router } = makeRouter();
    provider.enqueue(JSON.stringify(['Tema 1', 'Tema 2', 'Tema 3', 'Tema 4', 'Tema 5', 'Tema 6']));
    const slots = await planWeek(router, { tenantId: 't1', brand, weekStart: '2026-08-24' });
    expect(slots[0]!.topic).toBe('Tema 1');
    expect(slots[5]!.topic).toBe('Tema 6');
  });

  it('con salida no utilizable (mock/no JSON), deja los temas explícitamente por definir', async () => {
    const { provider, router } = makeRouter();
    provider.enqueue('no soy json');
    const slots = await planWeek(router, { tenantId: 't1', brand, weekStart: '2026-08-24' });
    for (const s of slots) {
      expect(s.topic).toMatch(/^Por definir/);
    }
  });
});
