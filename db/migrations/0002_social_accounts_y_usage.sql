-- Cuentas sociales conectadas por OAuth (spec §9-10 paso 4).
-- El token se guarda cifrado (AES-256-GCM); NUNCA en texto plano (spec §32).
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  platform TEXT NOT NULL DEFAULT 'instagram',
  external_account_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  token_encrypted TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, platform)
);
