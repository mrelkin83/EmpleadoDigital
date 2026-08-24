-- Deduplicación del polling de comentarios: un comentario se procesa una sola vez
-- aunque la API lo devuelva en cada pasada o el proceso se reinicie.
CREATE TABLE IF NOT EXISTS processed_comments (
  tenant_id uuid NOT NULL,
  comment_id text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, comment_id)
);
