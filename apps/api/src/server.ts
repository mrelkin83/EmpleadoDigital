import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { registerContentRoutes } from './routes/content.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

/**
 * Construcción del servidor HTTP. Separada del bootstrap para poder testearla
 * con inject() sin abrir puertos.
 */
export async function buildServer(ctx: AppContext): Promise<FastifyInstance> {
  // Logger HTTP propio de Fastify (pino por debajo) con redacción de cabeceras sensibles.
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      redact: ['req.headers.authorization', 'req.headers["x-hub-signature-256"]'],
    },
  });

  // Conserva el raw body para la verificación de firma de webhooks.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
    try {
      done(null, (body as Buffer).length ? JSON.parse((body as Buffer).toString('utf-8')) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  registerMiscRoutes(app, ctx);
  registerContentRoutes(app, ctx);
  registerWebhookRoutes(app, ctx);

  return app;
}
