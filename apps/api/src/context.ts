import { randomUUID } from 'node:crypto';
import { InMemoryUsageSink, TaskRouter, type UsageSink } from '@empleado/ai-core';
import { buildProvidersFromEnv } from '@empleado/ai-providers';
import { buildPilotBrandMemory } from '@empleado/brand';
import {
  CooldownService,
  InstagramConnector,
  KeywordMatcher,
  SocialPolicyEngine,
  refreshLongLivedToken,
} from '@empleado/social';
import {
  DEFAULT_AUTONOMY,
  decryptSecret,
  encryptSecret,
  logger,
  type ActivityEntry,
  type AutonomyConfig,
} from '@empleado/shared';
import { getEnv } from './env.js';
import { MemoryStore } from './store/memory.js';
import { PgStore } from './store/pg.js';
import { PgUsageSink } from './usage/pg-usage-sink.js';
import type { Store, StoredSocialAccount } from './store/store.js';

/**
 * Contexto de aplicación: composición de dependencias.
 * MVP: tenant único (spec §33: la arquitectura es multi-tenant; el despliegue inicial no).
 */
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export interface AppContext {
  store: Store;
  router: TaskRouter;
  policyEngine: SocialPolicyEngine;
  keywordMatcher: KeywordMatcher;
  cooldowns: CooldownService;
  instagram: InstagramConnector | null;
  /** Configuración de autonomía del tenant (MVP: en memoria; persistencia futura). */
  autonomy: AutonomyConfig;
  grantedScopes: string[];
  logActivity(entry: Omit<ActivityEntry, 'id' | 'tenantId' | 'at'>): Promise<void>;
  /** Activa la conexión de Instagram tras un OAuth exitoso (hot-swap sin reiniciar). */
  connectInstagram(account: StoredSocialAccount, plainToken: string): void;
}

export async function buildContext(): Promise<AppContext> {
  const env = getEnv();

  const store: Store = env.DATABASE_URL ? new PgStore(env.DATABASE_URL) : new MemoryStore();
  if (!env.DATABASE_URL) {
    logger.warn('Sin DATABASE_URL: usando almacenamiento en memoria (no persistente, solo desarrollo)');
  }

  // Seed del caso piloto si el tenant aún no tiene Brand Memory (spec §5: laboratorio, no límite).
  if (!(await store.getBrand(DEFAULT_TENANT_ID))) {
    await store.saveBrand(buildPilotBrandMemory(DEFAULT_TENANT_ID));
    logger.info('Brand Memory del caso piloto inicializada');
  }

  const providers = buildProvidersFromEnv();
  const usageSink: UsageSink =
    store instanceof PgStore ? new PgUsageSink(store.sql) : new InMemoryUsageSink();
  const router = new TaskRouter(providers, usageSink, {
    dailyBudgetUsd: env.AI_DAILY_BUDGET_USD,
  });

  const ctx: AppContext = {
    store,
    router,
    policyEngine: new SocialPolicyEngine(),
    keywordMatcher: new KeywordMatcher(),
    cooldowns: new CooldownService(),
    instagram: null,
    autonomy: DEFAULT_AUTONOMY,
    grantedScopes: [],
    async logActivity(entry) {
      await store.addActivity({
        id: randomUUID(),
        tenantId: DEFAULT_TENANT_ID,
        at: new Date(),
        ...entry,
      });
    },
    connectInstagram(account, plainToken) {
      ctx.instagram = new InstagramConnector({
        accessToken: plainToken,
        businessAccountId: account.externalAccountId,
      });
      ctx.grantedScopes = account.grantedScopes;
      subscribeAccountToWebhooks(ctx.instagram);
    },
  };

  await restoreInstagramConnection(ctx);
  return ctx;
}

/**
 * Restaura la conexión de Instagram al arrancar:
 * 1) cuenta OAuth almacenada (token cifrado) — con refresh automático si vence pronto;
 * 2) fallback: token por variables de entorno (setup manual de desarrollo).
 */
async function restoreInstagramConnection(ctx: AppContext): Promise<void> {
  const env = getEnv();

  const account = await ctx.store.getSocialAccount(DEFAULT_TENANT_ID, 'instagram');
  if (account && env.TOKEN_ENCRYPTION_KEY) {
    try {
      let token = decryptSecret(account.tokenEncrypted, env.TOKEN_ENCRYPTION_KEY);

      // Refresh proactivo: el token de larga duración dura 60 días y es refrescable
      // desde las 24h de emitido. Umbral: vence en menos de 10 días.
      const tenDays = 10 * 24 * 3600 * 1000;
      const dayMs = 24 * 3600 * 1000;
      const oldEnough = Date.now() - account.connectedAt.getTime() > dayMs;
      if (account.tokenExpiresAt && oldEnough && account.tokenExpiresAt.getTime() - Date.now() < tenDays) {
        try {
          const refreshed = await refreshLongLivedToken(token);
          token = refreshed.accessToken;
          await ctx.store.saveSocialAccount({
            ...account,
            tokenEncrypted: encryptSecret(token, env.TOKEN_ENCRYPTION_KEY),
            tokenExpiresAt: refreshed.expiresAt,
          });
          logger.info('Token de Instagram refrescado proactivamente');
        } catch (err) {
          logger.warn({ err }, 'No se pudo refrescar el token de Instagram; se usa el vigente');
        }
      }

      ctx.connectInstagram(account, token);
      logger.info({ username: account.username }, 'Instagram restaurado desde cuenta OAuth almacenada');
      return;
    } catch (err) {
      logger.error({ err }, 'No se pudo descifrar el token almacenado; reconecta la cuenta');
    }
  }

  if (env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_BUSINESS_ACCOUNT_ID) {
    ctx.instagram = new InstagramConnector({
      accessToken: env.INSTAGRAM_ACCESS_TOKEN,
      businessAccountId: env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
    });
    // Sin OAuth no hay lista real de permisos: se asumen los del MVP y la API los
    // validará en la primera llamada (spec §9). Preferir siempre el flujo OAuth.
    ctx.grantedScopes = [
      'instagram_business_basic',
      'instagram_business_content_publish',
      'instagram_business_manage_comments',
      'instagram_business_manage_messages',
    ];
    logger.info('Instagram configurado por variables de entorno (modo desarrollo)');
    subscribeAccountToWebhooks(ctx.instagram);
    return;
  }

  logger.warn('Instagram no conectado: usa /auth/instagram/login (OAuth) o variables INSTAGRAM_*');
}

/**
 * Suscripción de la cuenta a los webhooks de la app (requisito de Meta: sin
 * subscribed_apps no llegan eventos). Fire-and-forget: un fallo no debe impedir
 * el arranque ni la conexión; se registra y se reintenta en el próximo arranque.
 */
function subscribeAccountToWebhooks(connector: InstagramConnector): void {
  void connector
    .subscribeToWebhooks(['comments', 'messages'])
    .then(() => logger.info('Cuenta suscrita a los webhooks de la app (subscribed_apps)'))
    .catch((err) => logger.warn({ err }, 'No se pudo suscribir la cuenta a los webhooks'));
}
