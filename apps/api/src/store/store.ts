import type { BrandMemory } from '@empleado/brand';
import type { CalendarSlot, ContentPiece } from '@empleado/content';
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

export interface StoredSocialAccount {
  id: string;
  tenantId: string;
  platform: 'instagram';
  externalAccountId: string;
  username: string;
  /** Token cifrado con AES-256-GCM; nunca se guarda en claro (spec §32). */
  tokenEncrypted: string;
  tokenExpiresAt?: Date;
  grantedScopes: string[];
  connectedAt: Date;
}

export interface Store {
  getSocialAccount(tenantId: string, platform: string): Promise<StoredSocialAccount | null>;
  saveSocialAccount(account: StoredSocialAccount): Promise<void>;

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

  listCalendar(tenantId: string, fromDate?: string): Promise<CalendarSlot[]>;
  saveCalendarSlot(slot: CalendarSlot): Promise<void>;

  upsertLead(lead: Omit<Lead, 'id' | 'createdAt'>): Promise<void>;
  listLeads(tenantId: string): Promise<Lead[]>;

  /** Dedupe del polling de comentarios: true si es la primera vez que se ve el comentario. */
  markCommentProcessed(tenantId: string, commentId: string): Promise<boolean>;

  close(): Promise<void>;
}
