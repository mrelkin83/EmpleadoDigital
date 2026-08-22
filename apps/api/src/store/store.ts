import type { BrandMemory } from '@empleado/brand';
import type { ContentPiece } from '@empleado/content';
import type { ActivityEntry } from '@empleado/shared';

/**
 * Capa de persistencia. Dos implementaciones:
 * - MemoryStore: desarrollo/tests sin base de datos.
 * - PgStore: PostgreSQL (DATABASE_URL), esquema en /db/migrations.
 */
export interface ApprovalRequest {
  id: string;
  tenantId: string;
  kind: 'publish_content' | 'reply_comment' | 'reply_dm';
  /** Referencia al recurso pendiente (pieza de contenido, comentario, etc.). */
  resourceId: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface Lead {
  id: string;
  tenantId: string;
  igUserId: string;
  igUsername: string;
  source: 'comment' | 'dm' | 'mention';
  keywordId?: string;
  createdAt: Date;
}

export interface Store {
  getBrand(tenantId: string): Promise<BrandMemory | null>;
  saveBrand(memory: BrandMemory): Promise<void>;

  listContent(tenantId: string): Promise<ContentPiece[]>;
  getContent(tenantId: string, id: string): Promise<ContentPiece | null>;
  saveContent(piece: ContentPiece): Promise<void>;

  listActivity(tenantId: string, limit?: number): Promise<ActivityEntry[]>;
  addActivity(entry: ActivityEntry): Promise<void>;

  listApprovals(tenantId: string, status?: ApprovalRequest['status']): Promise<ApprovalRequest[]>;
  getApproval(tenantId: string, id: string): Promise<ApprovalRequest | null>;
  saveApproval(request: ApprovalRequest): Promise<void>;

  upsertLead(lead: Omit<Lead, 'id' | 'createdAt'>): Promise<void>;
  listLeads(tenantId: string): Promise<Lead[]>;

  close(): Promise<void>;
}
