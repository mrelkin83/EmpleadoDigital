import { describe, expect, it } from 'vitest';
import { BudgetExceededError, InMemoryUsageSink, TaskRouter } from '@empleado/ai-core';
import { MockProvider } from '@empleado/ai-providers';

describe('TaskRouter', () => {
  it('enruta clasificación al modelo rápido y copywriting al creativo', () => {
    const provider = new MockProvider();
    const router = new TaskRouter([provider], new InMemoryUsageSink());
    expect(router.select('classification').model).toBe('mock-fast');
    expect(router.select('copywriting').model).toBe('mock-creative');
    expect(router.select('strategic_analysis').model).toBe('mock-reasoning');
  });

  it('respeta el override manual del administrador', () => {
    const provider = new MockProvider();
    const router = new TaskRouter([provider], new InMemoryUsageSink());
    const sel = router.select('copywriting', { provider: 'mock', model: 'mock-custom' });
    expect(sel.model).toBe('mock-custom');
    expect(sel.reason).toBe('manual_override');
  });

  it('falla con claridad si ningún proveedor soporta la clase de modelo', () => {
    const provider = new MockProvider(); // sin capacidad de imagen
    const router = new TaskRouter([provider], new InMemoryUsageSink());
    expect(() => router.select('image_generation')).toThrowError(/image/);
  });

  it('registra uso (proveedor, modelo, coste, motivo) en cada ejecución', async () => {
    const provider = new MockProvider();
    const sink = new InMemoryUsageSink();
    const router = new TaskRouter([provider], sink);
    await router.run({ tenantId: 't1', taskType: 'copywriting', input: { prompt: 'hola' } });
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      tenantId: 't1',
      provider: 'mock',
      operation: 'copywriting',
      success: true,
    });
  });

  it('bloquea la ejecución cuando el presupuesto diario está agotado', async () => {
    const provider = new MockProvider();
    const sink = new InMemoryUsageSink();
    sink.records.push({
      tenantId: 't1',
      provider: 'mock',
      model: 'mock-creative',
      operation: 'copywriting',
      estimatedCostUsd: 10,
      durationMs: 5,
      success: true,
      selectionReason: 'test',
      at: new Date(),
    });
    const router = new TaskRouter([provider], sink, { dailyBudgetUsd: 5 });
    await expect(
      router.run({ tenantId: 't1', taskType: 'copywriting', input: { prompt: 'hola' } }),
    ).rejects.toThrowError(BudgetExceededError);
  });
});
