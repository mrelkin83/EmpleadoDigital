-- Calendario editorial (spec §44).
CREATE TABLE IF NOT EXISTS calendar_slots (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  date DATE NOT NULL,
  time TEXT NOT NULL,
  format TEXT NOT NULL,
  pillar TEXT NOT NULL,
  funnel TEXT NOT NULL,
  topic TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'instagram',
  content_piece_id UUID,
  status TEXT NOT NULL DEFAULT 'planned'
);
CREATE INDEX IF NOT EXISTS idx_calendar_tenant_date ON calendar_slots(tenant_id, date);
