import { z } from 'zod';

/**
 * Validación de entorno (patrón adaptado de juancadile/instabot con zod).
 * Los secretos viven SOLO en variables de entorno (spec §32); nunca en código ni repo.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  API_HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().optional(),
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  OAUTH_REDIRECT_URI: z.string().url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().length(64).optional(),
  WEB_BASE_URL: z.string().url().default('http://localhost:3000'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),
  AI_DAILY_BUDGET_USD: z.coerce.number().default(5),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Configuración de entorno inválida: ${parsed.error.message}`);
    }
    cached = parsed.data;
  }
  return cached;
}
