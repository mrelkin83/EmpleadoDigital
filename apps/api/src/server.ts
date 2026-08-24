import Fastify, { type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AppContext } from './context.js';

/** Carpeta donde se guarda el material subido (imágenes/videos); servida en /media/. */
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCalendarRoutes } from './routes/calendar.js';
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

  // Subida de material (multipart) y servicio público de /media/ para que
  // la API de Instagram pueda descargar la imagen a través del túnel/dominio.
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
  mkdirSync(UPLOADS_DIR, { recursive: true });
  await app.register(fastifyStatic, { root: UPLOADS_DIR, prefix: '/media/' });

  registerMiscRoutes(app, ctx);
  registerAnalyticsRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerContentRoutes(app, ctx);
  registerCalendarRoutes(app, ctx);
  registerWebhookRoutes(app, ctx);

  return app;
}
