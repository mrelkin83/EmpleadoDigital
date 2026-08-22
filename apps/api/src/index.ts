import { logger } from '@empleado/shared';
import { buildContext } from './context.js';
import { buildServer } from './server.js';
import { getEnv } from './env.js';

async function main(): Promise<void> {
  const env = getEnv();
  const ctx = await buildContext();
  const app = await buildServer(ctx);

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  logger.info({ port: env.API_PORT }, 'API del empleado digital escuchando');

  const shutdown = async () => {
    await app.close();
    await ctx.store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error({ err }, 'Fallo al iniciar la API');
  process.exit(1);
});
