/**
 * Modelo multi-tenant (spec §33). El MVP opera con un solo tenant,
 * pero todo dato de negocio viaja con tenantId desde el día 1 para no mezclar datos.
 */
export interface Tenant {
  id: string;
  name: string;
  createdAt: Date;
}

export interface SocialAccount {
  id: string;
  tenantId: string;
  platform: 'instagram'; // primer canal; la unión se ampliará (facebook | tiktok | ...)
  externalAccountId: string;
  accountType: 'business' | 'creator' | 'personal';
  /** Permisos/scopes realmente concedidos vía OAuth, validados tras conectar (spec §9). */
  grantedScopes: string[];
  connectedAt: Date;
}
