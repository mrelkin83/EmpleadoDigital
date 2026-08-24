/**
 * Sistema de contenido (spec §43): cada pieza lleva metadata de intención.
 * La plataforma no publica "por publicar"; publica con intención (spec §19-20).
 */
export type ContentFormat = 'reel' | 'carousel' | 'image' | 'story' | 'text';
export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';
export type ContentStatus =
  | 'idea'
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'failed'
  | 'rejected';

export interface ContentPiece {
  id: string;
  tenantId: string;
  format: ContentFormat;
  pillar: string;
  funnel: FunnelStage;
  topic: string;
  hook: string;
  body: string;
  cta: string;
  status: ContentStatus;
  approval: 'not_required' | 'pending' | 'approved' | 'rejected';
  scheduledAt?: Date;
  publishedMediaId?: string;
  /**
   * Material de la pieza. `carousel`: `filename` es la portada y `items` trae
   * todas las láminas en orden.
   */
  media?: {
    filename: string;
    mime: string;
    kind: 'image' | 'video' | 'carousel';
    items?: Array<{ filename: string; mime: string }>;
  };
  /** Trazabilidad de generación (spec §39): proveedor/modelo que creó el borrador. */
  generatedBy?: { provider: string; model: string };
  createdAt: Date;
  updatedAt: Date;
}

/** Transiciones válidas del flujo de publicación (spec §42, §45). */
const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  idea: ['draft', 'rejected'],
  draft: ['in_review', 'rejected'],
  in_review: ['approved', 'rejected', 'draft'],
  approved: ['scheduled', 'published', 'rejected'],
  scheduled: ['published', 'failed', 'approved'],
  published: [],
  failed: ['scheduled', 'rejected'],
  rejected: ['draft'],
};

export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
