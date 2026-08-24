-- Feedback binario del usuario sobre piezas (semilla del "AI-Match" propio, D24):
-- cada aprobación/rechazo se registra con motivo y el perfil de la pieza para que
-- la generación futura aprenda las preferencias del cliente.
CREATE TABLE IF NOT EXISTS content_feedback (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  piece_id uuid NOT NULL,
  verdict text NOT NULL CHECK (verdict IN ('approved', 'rejected')),
  reason text,
  pillar text NOT NULL,
  funnel text NOT NULL,
  format text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_feedback_tenant ON content_feedback (tenant_id, created_at DESC);
