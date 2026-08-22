import { describe, expect, it } from 'vitest';
import { buildAuthorizeUrl, missingScopes, MVP_SCOPES } from '@empleado/social';

describe('OAuth de Instagram', () => {
  it('construye la URL de autorización con los parámetros oficiales', () => {
    const url = new URL(
      buildAuthorizeUrl({ appId: '123', redirectUri: 'https://api.ejemplo.com/cb' }, 'estado-x'),
    );
    expect(url.origin + url.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('123');
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.ejemplo.com/cb');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('estado-x');
    expect(url.searchParams.get('scope')).toBe(MVP_SCOPES.join(','));
  });

  it('detecta scopes faltantes tras conectar (spec §9)', () => {
    expect(missingScopes([...MVP_SCOPES])).toEqual([]);
    expect(missingScopes(['instagram_business_basic'])).toEqual([
      'instagram_business_content_publish',
      'instagram_business_manage_comments',
      'instagram_business_manage_messages',
    ]);
  });
});
