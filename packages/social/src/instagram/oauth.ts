import { ProviderError } from '@empleado/shared';

/**
 * OAuth de Instagram (Business Login) — endpoints verificados contra la documentación
 * oficial de Meta (developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login, 2026-08).
 *
 * Flujo (spec §10 paso 4): authorize → code → short-lived token → long-lived token (60 días)
 * → refresh periódico. Los scopes concedidos se validan tras conectar (spec §9).
 */
const AUTHORIZE_URL = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const GRAPH_BASE = 'https://graph.instagram.com';

/** Scopes que el MVP solicita (nomenclatura vigente desde 2025-01-27). */
export const MVP_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
] as const;

export interface OAuthAppConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

export function buildAuthorizeUrl(
  config: Pick<OAuthAppConfig, 'appId' | 'redirectUri'>,
  state: string,
  scopes: readonly string[] = MVP_SCOPES,
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(','));
  url.searchParams.set('state', state);
  return url.toString();
}

export interface ShortLivedTokenResult {
  accessToken: string;
  userId: string;
  /** Permisos efectivamente concedidos por el usuario. */
  permissions: string[];
}

export async function exchangeCodeForToken(
  config: OAuthAppConfig,
  code: string,
): Promise<ShortLivedTokenResult> {
  const body = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri,
    code,
  });
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new ProviderError('Fallo el intercambio de código OAuth con Instagram', {
      status: response.status,
      body: (await response.text().catch(() => '')).slice(0, 300),
    });
  }
  const data = (await response.json()) as {
    access_token?: string;
    user_id?: string | number;
    permissions?: string[] | string;
  };
  if (!data.access_token || data.user_id === undefined) {
    throw new ProviderError('Respuesta OAuth de Instagram incompleta');
  }
  const permissions = Array.isArray(data.permissions)
    ? data.permissions
    : typeof data.permissions === 'string'
      ? data.permissions.split(',').map((s) => s.trim())
      : [];
  return { accessToken: data.access_token, userId: String(data.user_id), permissions };
}

export interface LongLivedTokenResult {
  accessToken: string;
  expiresAt: Date;
}

export async function exchangeForLongLivedToken(
  appSecret: string,
  shortLivedToken: string,
): Promise<LongLivedTokenResult> {
  const url = new URL(`${GRAPH_BASE}/access_token`);
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('access_token', shortLivedToken);
  return fetchLongLived(url);
}

/** El token debe tener al menos 24h de antigüedad y seguir vigente. */
export async function refreshLongLivedToken(accessToken: string): Promise<LongLivedTokenResult> {
  const url = new URL(`${GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', accessToken);
  return fetchLongLived(url);
}

async function fetchLongLived(url: URL): Promise<LongLivedTokenResult> {
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new ProviderError('Fallo el intercambio/refresh de token de larga duración', {
      status: response.status,
      body: (await response.text().catch(() => '')).slice(0, 300),
    });
  }
  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new ProviderError('Respuesta de token de larga duración incompleta');
  }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 60 * 24 * 3600) * 1000),
  };
}

/** Validación post-conexión (spec §9): qué scopes del MVP faltan. */
export function missingScopes(granted: string[], required: readonly string[] = MVP_SCOPES): string[] {
  return required.filter((s) => !granted.includes(s));
}
