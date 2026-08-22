import postgres from 'postgres';
import type { AIUsageRecord, UsageSink } from '@empleado/ai-core';

/**
 * Persistencia del registro de uso de IA en PostgreSQL (tabla ai_usage, spec §38).
 * Cierra el pendiente D-2026-08-21: sin esto, el presupuesto diario se reiniciaba
 * al reiniciar el proceso.
 */
export class PgUsageSink implements UsageSink {
  constructor(private readonly sql: postgres.Sql) {}

  async record(r: AIUsageRecord): Promise<void> {
    await this.sql`
      INSERT INTO ai_usage (tenant_id, provider, model, operation, input_tokens, output_tokens,
        estimated_cost_usd, duration_ms, success, selection_reason, at)
      VALUES (${r.tenantId}, ${r.provider}, ${r.model}, ${r.operation},
        ${r.inputTokens ?? null}, ${r.outputTokens ?? null}, ${r.estimatedCostUsd},
        ${r.durationMs}, ${r.success}, ${r.selectionReason}, ${r.at})`;
  }

  async spentTodayUsd(tenantId: string): Promise<number> {
    const rows = await this.sql`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) AS total
      FROM ai_usage
      WHERE tenant_id = ${tenantId} AND at >= date_trunc('day', now() AT TIME ZONE 'utc')`;
    return Number(rows[0]?.['total'] ?? 0);
  }
}
