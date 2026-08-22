import { randomUUID } from 'node:crypto';
import { InMemoryUsageSink, TaskRouter } from '@empleado/ai-core';
import { buildProvidersFromEnv } from '@empleado/ai-providers';
import { buildPilotBrandMemory } from '@empleado/brand';
import {
  CooldownService,
  InstagramConnector,
  KeywordMatcher,
  SocialPolicyEngine,
} from '@empleado/social';
import { DEFAULT_AUTONOMY, logger, type ActivityEntry, type AutonomyConfig } from '@empleado/shared';
import { getEnv } from './env.js';
import { MemoryStore } from './store/memory.js';
import { PgStore } from './store/pg.js';
import type { Store } from './store/store.js';

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
  const router = new TaskRouter(providers, new InMemoryUsageSink(), {
    dailyBudgetUsd: env.AI_DAILY_BUDGET_USD,
  });

  const instagram =
    env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_BUSINESS_ACCOUNT_ID
      ? new InstagramConnector({
          accessToken: env.INSTAGRAM_ACCESS_TOKEN,
          businessAccountId: env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
        })
      : null;
  if (!instagram) {
    logger.warn('Instagram no conectado: define INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_BUSINESS_ACCOUNT_ID');
  }

  // Los scopes reales se validarán tras el flujo OAuth (spec §9). Sin conexión: sin scopes.
  const grantedScopes = instagram
    ? [
        'instagram_business_basic',
        'instagram_business_content_publish',
        'instagram_business_manage_comments',
        'instagram_business_manage_messages',
      ]
    : [];

  const ctx: AppContext = {
    store,
    router,
    policyEngine: new SocialPolicyEngine(),
    keywordMatcher: new KeywordMatcher(),
    cooldowns: new CooldownService(),
    instagram,
    autonomy: DEFAULT_AUTONOMY,
    grantedScopes,
    async logActivity(entry) {
      await store.addActivity({
        id: randomUUID(),
        tenantId: DEFAULT_TENANT_ID,
        at: new Date(),
        ...entry,
      });
    },
  };
  return ctx;
}
