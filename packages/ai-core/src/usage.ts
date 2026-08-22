/**
 * Registro de uso y control de costes (spec §15, §38).
 */
export interface AIUsageRecord {
  tenantId: string;
  provider: string;
  model: string;
  operation: string; // taskType
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd: number;
  durationMs: number;
  success: boolean;
  selectionReason: string;
  at: Date;
}

export interface UsageSink {
  record(record: AIUsageRecord): Promise<void>;
  /** Gasto acumulado del tenant en el día actual (UTC). */
  spentTodayUsd(tenantId: string): Promise<number>;
}

/** Sink en memoria para desarrollo y tests. La persistencia real vive en apps/api (tabla ai_usage). */
export class InMemoryUsageSink implements UsageSink {
  readonly records: AIUsageRecord[] = [];

  async record(record: AIUsageRecord): Promise<void> {
    this.records.push(record);
  }

  async spentTodayUsd(tenantId: string): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    return this.records
      .filter((r) => r.tenantId === tenantId && r.at.toISOString().slice(0, 10) === today)
      .reduce((sum, r) => sum + r.estimatedCostUsd, 0);
  }
}

/**
 * Estimación aproximada de coste por tokens. Los precios reales se configuran por proveedor;
 * estos defaults sirven para presupuestar y se corrigen con datos reales (spec §15).
 */
export function estimateCostUsd(
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  pricePerMTokIn = 3,
  pricePerMTokOut = 15,
): number {
  const inCost = ((inputTokens ?? 0) / 1_000_000) * pricePerMTokIn;
  const outCost = ((outputTokens ?? 0) / 1_000_000) * pricePerMTokOut;
  return Number((inCost + outCost).toFixed(6));
}
