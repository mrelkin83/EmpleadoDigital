-- Migración inicial: fundación multi-tenant (spec §33) + MVP Instagram (spec §95).
-- Todos los datos de negocio llevan tenant_id; nunca se mezclan datos entre tenants.

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Brand Memory (spec §17): documento estructurado por tenant.
CREATE TABLE IF NOT EXISTS brand_memories (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id),
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Piezas de contenido con metadata de intención (spec §43).
CREATE TABLE IF NOT EXISTS content_pieces (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  format TEXT NOT NULL,
  pillar TEXT NOT NULL,
  funnel TEXT NOT NULL,
  topic TEXT NOT NULL,
  hook TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  cta TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  approval TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  published_media_id TEXT,
  generated_by JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_tenant ON content_pieces(tenant_id, created_at DESC);

-- Bitácora del empleado (spec §30) — auditable, sin secretos.
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  at TIMESTAMPTZ NOT NULL,
  actor TEXT NOT NULL,
  summary TEXT NOT NULL,
  explanation JSONB,
  kind TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_tenant ON activity_log(tenant_id, at DESC);

-- Solicitudes de aprobación (human-in-the-loop, spec §40).
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_approvals_tenant ON approval_requests(tenant_id, status);

-- Leads capturados por interacciones autorizadas (patrón instabot).
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  ig_user_id TEXT NOT NULL,
  ig_username TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  keyword_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, ig_user_id)
);

-- Registro de uso de IA para control de costes (spec §38).
CREATE TABLE IF NOT EXISTS ai_usage (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  operation TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  selection_reason TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_day ON ai_usage(tenant_id, at);

-- Jobs (spec §41): sistema de tareas observable y reintentable.
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | running | succeeded | failed | cancelled
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, run_at);
