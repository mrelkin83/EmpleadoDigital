import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  missingScopes,
  MVP_SCOPES,
} from '@empleado/social';
import { encryptSecret, logger } from '@empleado/shared';
import { getEnv } from '../env.js';
import { DEFAULT_TENANT_ID, type AppContext } from '../context.js';

/**
 * OAuth de Instagram (Business Login) — spec §10 paso 4.
 * GET /auth/instagram/login    → redirige a Meta con state anti-CSRF.
 * GET /auth/instagram/callback → intercambia code → token corto → token largo (60 días),
 *                                guarda el token CIFRADO, valida scopes y activa la conexión.
 */

/** States pendientes con TTL de 10 minutos (anti-CSRF). */
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function issueState(): string {
  for (const [s, at] of pendingStates) {
    if (Date.now() - at > STATE_TTL_MS) pendingStates.delete(s);
  }
  const state = randomBytes(24).toString('base64url');
  pendingStates.set(state, Date.now());
  return state;
}

function consumeState(state: string | undefined): boolean {
  if (!state) return false;
  const at = pendingStates.get(state);
  pendingStates.delete(state);
  return at !== undefined && Date.now() - at <= STATE_TTL_MS;
}

function oauthConfig() {
  const env = getEnv();
  if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_APP_SECRET || !env.OAUTH_REDIRECT_URI) {
    return null;
  }
  return {
    appId: env.INSTAGRAM_APP_ID,
    appSecret: env.INSTAGRAM_APP_SECRET,
    redirectUri: env.OAUTH_REDIRECT_URI,
  };
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/auth/instagram/login', async (_request, reply) => {
    const config = oauthConfig();
    if (!config) {
      return reply.status(503).send({
        error: 'oauth_not_configured',
        message:
          'Define INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET y OAUTH_REDIRECT_URI (app de Meta en developers.facebook.com).',
      });
    }
    return reply.redirect(buildAuthorizeUrl(config, issueState()));
  });

  app.get('/auth/instagram/callback', async (request, reply) => {
    const env = getEnv();
    const config = oauthConfig();
    const q = request.query as { code?: string; state?: string; error?: string; error_description?: string };

    if (!config) return reply.status(503).send({ error: 'oauth_not_configured' });
    if (q.error) {
      logger.warn({ error: q.error, description: q.error_description }, 'OAuth denegado por el usuario');
      return reply.redirect(`${env.WEB_BASE_URL}/?connect=denied`);
    }
    if (!consumeState(q.state)) {
      return reply.status(403).send({ error: 'invalid_state', message: 'State inválido o expirado; reintenta la conexión.' });
    }
    if (!q.code) return reply.status(400).send({ error: 'missing_code' });
    if (!env.TOKEN_ENCRYPTION_KEY) {
      return reply.status(503).send({
        error: 'encryption_key_missing',
        message: 'Define TOKEN_ENCRYPTION_KEY (64 hex) para almacenar tokens cifrados.',
      });
    }

    // code → token corto → token de larga duración (60 días).
    const shortLived = await exchangeCodeForToken(config, q.code);
    const longLived = await exchangeForLongLivedToken(config.appSecret, shortLived.accessToken);

    const granted = shortLived.permissions.length ? shortLived.permissions : [...MVP_SCOPES];

    // Perfil de la cuenta (no bloqueante: si falla, el username queda vacío).
    const profile = await fetchInstagramProfile(longLived.accessToken).catch((err) => {
      logger.warn({ err }, 'No se pudo leer el perfil tras el OAuth');
      return null;
    });

    const account = {
      id: randomUUID(),
      tenantId: DEFAULT_TENANT_ID,
      platform: 'instagram' as const,
      externalAccountId: profile?.userId || shortLived.userId,
      username: profile?.username ?? '',
      tokenEncrypted: encryptSecret(longLived.accessToken, env.TOKEN_ENCRYPTION_KEY),
      tokenExpiresAt: longLived.expiresAt,
      grantedScopes: granted,
      connectedAt: new Date(),
    };
    await ctx.store.saveSocialAccount(account);
    ctx.connectInstagram(account, longLived.accessToken);

    const missing = missingScopes(granted);
    await ctx.logActivity({
      actor: 'sistema',
      kind: missing.length ? 'alert' : 'action',
      summary: missing.length
        ? `Instagram conectado, pero faltan permisos: ${missing.join(', ')}. Algunas funciones estarán bloqueadas.`
        : 'Cuenta de Instagram conectada por OAuth con todos los permisos del MVP.',
    });

    return reply.redirect(`${env.WEB_BASE_URL}/?connect=ok`);
  });

  /** Estado de la conexión social para el dashboard (spec §29: alertas de permisos). */
  app.get('/api/social/status', async () => {
    const account = await ctx.store.getSocialAccount(DEFAULT_TENANT_ID, 'instagram');
    return {
      connected: ctx.instagram !== null,
      via: account ? 'oauth' : ctx.instagram ? 'env' : null,
      grantedScopes: ctx.grantedScopes,
      missingScopes: missingScopes(ctx.grantedScopes),
      tokenExpiresAt: account?.tokenExpiresAt ?? null,
    };
  });
}
