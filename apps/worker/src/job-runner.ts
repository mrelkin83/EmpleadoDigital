import type postgres from 'postgres';
import { logger } from '@empleado/shared';

/**
 * Sistema de jobs (spec §41): cola respaldada por PostgreSQL (tabla jobs, migración 0001).
 * Jobs idempotentes, reintentables, observables y cancelables.
 * Se usa SELECT ... FOR UPDATE SKIP LOCKED para permitir varios workers.
 */
export type JobHandler = (payload: Record<string, unknown>, tenantId: string) => Promise<void>;

export interface JobRow {
  id: string;
  tenant_id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export class JobRunner {
  private readonly handlers = new Map<string, JobHandler>();
  private running = false;

  constructor(
    private readonly sql: postgres.Sql,
    private readonly pollIntervalMs = 5000,
  ) {}

  register(type: string, handler: JobHandler): void {
    this.handlers.set(type, handler);
  }

  async enqueue(tenantId: string, type: string, payload: Record<string, unknown>, runAt?: Date): Promise<void> {
    await this.sql`
      INSERT INTO jobs (id, tenant_id, type, payload, run_at)
      VALUES (gen_random_uuid(), ${tenantId}, ${type}, ${this.sql.json(payload as postgres.JSONValue)}, ${runAt ?? new Date()})`;
  }

  start(): void {
    this.running = true;
    void this.loop();
    logger.info('Worker de jobs iniciado');
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const processed = await this.processNext();
        if (!processed) {
          await new Promise((r) => setTimeout(r, this.pollIntervalMs));
        }
      } catch (err) {
        logger.error({ err }, 'Error en el loop del worker');
        await new Promise((r) => setTimeout(r, this.pollIntervalMs));
      }
    }
  }

  /** Toma y ejecuta el siguiente job pendiente. Devuelve false si no había ninguno. */
  async processNext(): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      const rows = await tx`
        SELECT id, tenant_id, type, payload, attempts, max_attempts
        FROM jobs
        WHERE status = 'pending' AND run_at <= now()
        ORDER BY run_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return false;

      const job = rows[0] as unknown as JobRow;
      await tx`UPDATE jobs SET status = 'running', started_at = now(), attempts = attempts + 1 WHERE id = ${job.id}`;

      const handler = this.handlers.get(job.type);
      try {
        if (!handler) throw new Error(`Sin handler registrado para el tipo de job "${job.type}"`);
        await handler(job.payload, job.tenant_id);
        await tx`UPDATE jobs SET status = 'succeeded', finished_at = now() WHERE id = ${job.id}`;
        logger.info({ jobId: job.id, type: job.type }, 'Job completado');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const willRetry = job.attempts + 1 < job.max_attempts;
        await tx`
          UPDATE jobs SET
            status = ${willRetry ? 'pending' : 'failed'},
            run_at = ${willRetry ? new Date(Date.now() + 60_000 * (job.attempts + 1)) : new Date()},
            finished_at = ${willRetry ? null : new Date()},
            last_error = ${message}
          WHERE id = ${job.id}`;
        logger.error({ jobId: job.id, type: job.type, willRetry, err: message }, 'Job falló');
      }
      return true;
    });
  }
}
