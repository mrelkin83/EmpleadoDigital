import postgres from 'postgres';
import { logger } from '@empleado/shared';
import { JobRunner } from './job-runner.js';

/**
 * Worker de background (spec §34, §41). Requiere DATABASE_URL (la cola vive en PostgreSQL).
 * Handlers del MVP: se registrarán aquí a medida que los flujos se muevan a background
 * (GenerateContentJob, AnalyzeMetricsJob, PublishPostJob...).
 */
async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    logger.error('DATABASE_URL requerida para el worker (docker compose up -d && npm run db:migrate)');
    process.exit(1);
  }

  const sql = postgres(url, { max: 5 });
  const runner = new JobRunner(sql);

  // Job de ejemplo/heartbeat: verifica el sistema de colas end-to-end.
  runner.register('heartbeat', async (payload) => {
    logger.info({ payload }, 'Heartbeat del worker');
  });

  runner.start();

  const shutdown = async () => {
    runner.stop();
    await sql.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Fallo al iniciar el worker');
  process.exit(1);
});
