-- Reglas de keywords del Community Manager (spec §26): configuración por tenant,
-- no código duro. La respuesta sugerida SIEMPRE pasa por el Policy Engine.
CREATE TABLE IF NOT EXISTS keyword_rules (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  keyword text NOT NULL,
  aliases jsonb NOT NULL DEFAULT '[]',
  match_type text NOT NULL DEFAULT 'word_boundary' CHECK (match_type IN ('exact', 'contains', 'word_boundary')),
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  cooldown_minutes integer NOT NULL DEFAULT 1440,
  response_template text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_keyword_rules_tenant ON keyword_rules (tenant_id);
