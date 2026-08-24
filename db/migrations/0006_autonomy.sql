-- Configuración de autonomía por tenant (spec §10-11), persistida para
-- sobrevivir reinicios. config = AutonomyConfig serializada (jsonb).
CREATE TABLE IF NOT EXISTS autonomy_config (
  tenant_id uuid PRIMARY KEY,
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
