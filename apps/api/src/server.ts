import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AppContext } from './context.js';

/** Carpeta donde se guarda el material subido (imágenes/videos); servida en /media/. */
export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
import { authenticatedUser, registerAccountRoutes } from './routes/account.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCalendarRoutes } from './routes/calendar.js';
import { registerContentRoutes } from './routes/content.js';
import { registerMiscRoutes } from './routes/misc.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

/**
 * Rutas alcanzables SIN sesión del panel: lo que Meta necesita golpear desde
 * fuera (webhooks, material público, callback de OAuth) y el propio login.
 */
// /auth/instagram/login (iniciar conexión) SÍ requiere sesión: conectar una
// cuenta de Instagram es una acción sensible, no algo que deba poder disparar
// cualquier visitante. /callback queda público porque Meta redirige aquí.
const PUBLIC_PATH_PREFIXES = ['/webhooks', '/media', '/auth/instagram/callback', '/health'];
const PUBLIC_API_PATHS = new Set([
  '/api/account/status',
  '/api/account/setup',
  '/api/account/login',
  '/api/account/reset-password',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_API_PATHS.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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

  // Rate limiting global (spec §32): tope generoso para el dashboard local y
  // exento para lo que consume Meta (webhooks y descarga de material), cuyo
  // ritmo no controlamos y no debe toparse nunca con un 429 nuestro.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    allowList: (req) => req.url.startsWith('/webhooks') || req.url.startsWith('/media'),
  });

  // Subida de material (multipart) y servicio público de /media/ para que
  // la API de Instagram pueda descargar la imagen a través del túnel/dominio.
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
  mkdirSync(UPLOADS_DIR, { recursive: true });
  await app.register(fastifyStatic, { root: UPLOADS_DIR, prefix: '/media/' });

  // Login del panel (cookie de sesión httpOnly). Guardián global: todo lo que
  // no esté en la lista pública exige sesión válida, incluida /api/* completa.
  await app.register(cookie);
  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    if (isPublicPath(pathname)) return;
    const user = await authenticatedUser(ctx, request);
    if (!user) {
      reply.status(401).send({ error: 'unauthenticated', message: 'Inicia sesión para continuar.' });
    }
  });

  registerAccountRoutes(app, ctx);
  registerMiscRoutes(app, ctx);
  registerAnalyticsRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerContentRoutes(app, ctx);
  registerCalendarRoutes(app, ctx);
  registerWebhookRoutes(app, ctx);

  return app;
}
