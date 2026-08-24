-- Material adjunto a una pieza de contenido (imagen/video subido por el usuario).
-- Se guarda como jsonb: { filename, mime, kind }. El archivo vive en uploads/ (fuera del repo).
ALTER TABLE content_pieces ADD COLUMN IF NOT EXISTS media jsonb;
