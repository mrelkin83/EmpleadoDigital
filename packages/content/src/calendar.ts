import type { ContentFormat, ContentPiece, FunnelStage } from './content-piece.js';

/**
 * Calendario editorial (spec §44): día, hora, formato, tema, pilar, objetivo, estado.
 */
export interface CalendarSlot {
  id: string;
  tenantId: string;
  date: string; // ISO date (YYYY-MM-DD)
  time: string; // HH:mm hora local del tenant
  format: ContentFormat;
  pillar: string;
  funnel: FunnelStage;
  topic: string;
  objective: string;
  channel: 'instagram';
  contentPieceId?: string;
  status: 'planned' | 'content_ready' | 'scheduled' | 'published' | 'skipped';
}

/**
 * Distribución de funnel recomendada para una semana (spec §20: no convertir
 * todo el contenido en publicidad — mayoría TOFU/MOFU, poco BOFU).
 */
export const WEEKLY_FUNNEL_MIX: Record<FunnelStage, number> = {
  TOFU: 3,
  MOFU: 2,
  BOFU: 1,
};

export function validateWeeklyMix(slots: CalendarSlot[]): { balanced: boolean; detail: string } {
  const counts: Record<FunnelStage, number> = { TOFU: 0, MOFU: 0, BOFU: 0 };
  for (const s of slots) counts[s.funnel]++;
  const total = slots.length;
  if (total === 0) return { balanced: true, detail: 'Calendario vacío.' };
  const bofuRatio = counts.BOFU / total;
  // Regla anti-"todo publicidad": BOFU no debe superar un tercio del calendario.
  const balanced = bofuRatio <= 1 / 3;
  return {
    balanced,
    detail: `TOFU=${counts.TOFU}, MOFU=${counts.MOFU}, BOFU=${counts.BOFU} (${Math.round(bofuRatio * 100)}% conversión)`,
  };
}

export function attachContent(slot: CalendarSlot, piece: ContentPiece): CalendarSlot {
  return { ...slot, contentPieceId: piece.id, status: 'content_ready' };
}
