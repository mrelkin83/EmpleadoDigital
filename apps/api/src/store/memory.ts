import { randomUUID } from 'node:crypto';
import type { BrandMemory } from '@empleado/brand';
import type { CalendarSlot, ContentPiece } from '@empleado/content';
import type { ActivityEntry, AutonomyConfig } from '@empleado/shared';
import type { KeywordRule } from '@empleado/social';
import type { ApprovalRequest, ContentFeedback, Lead, Store, StoredSocialAccount } from './store.js';

/** Almacenamiento en memoria para desarrollo sin base de datos. No persistente. */
export class MemoryStore implements Store {
  private brands = new Map<string, BrandMemory>();
  private content = new Map<string, ContentPiece>();
  private activity: ActivityEntry[] = [];
  private approvals = new Map<string, ApprovalRequest>();
  private leads = new Map<string, Lead>();
  private socialAccounts = new Map<string, StoredSocialAccount>();
  private processedComments = new Set<string>();
  private autonomyConfigs = new Map<string, AutonomyConfig>();
  private feedback: ContentFeedback[] = [];
  private keywordRules = new Map<string, KeywordRule[]>();

  async getSocialAccount(tenantId: string, platform: string): Promise<StoredSocialAccount | null> {
    return this.socialAccounts.get(`${tenantId}:${platform}`) ?? null;
  }

  async saveSocialAccount(account: StoredSocialAccount): Promise<void> {
    this.socialAccounts.set(`${account.tenantId}:${account.platform}`, account);
  }

  async getBrand(tenantId: string): Promise<BrandMemory | null> {
    return this.brands.get(tenantId) ?? null;
  }

  async saveBrand(memory: BrandMemory): Promise<void> {
    this.brands.set(memory.tenantId, memory);
  }

  async listContent(tenantId: string): Promise<ContentPiece[]> {
    return [...this.content.values()]
      .filter((p) => p.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getContent(tenantId: string, id: string): Promise<ContentPiece | null> {
    const piece = this.content.get(id);
    return piece && piece.tenantId === tenantId ? piece : null;
  }

  async saveContent(piece: ContentPiece): Promise<void> {
    this.content.set(piece.id, piece);
  }

  async listActivity(tenantId: string, limit = 50): Promise<ActivityEntry[]> {
    return this.activity
      .filter((a) => a.tenantId === tenantId)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
  }

  async addActivity(entry: ActivityEntry): Promise<void> {
    this.activity.push(entry);
  }

  async listApprovals(tenantId: string, status?: ApprovalRequest['status']): Promise<ApprovalRequest[]> {
    return [...this.approvals.values()]
      .filter((a) => a.tenantId === tenantId && (!status || a.status === status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getApproval(tenantId: string, id: string): Promise<ApprovalRequest | null> {
    const req = this.approvals.get(id);
    return req && req.tenantId === tenantId ? req : null;
  }

  async saveApproval(request: ApprovalRequest): Promise<void> {
    this.approvals.set(request.id, request);
  }

  private calendar = new Map<string, CalendarSlot>();

  async listCalendar(tenantId: string, fromDate?: string): Promise<CalendarSlot[]> {
    return [...this.calendar.values()]
      .filter((s) => s.tenantId === tenantId && (!fromDate || s.date >= fromDate))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }

  async saveCalendarSlot(slot: CalendarSlot): Promise<void> {
    this.calendar.set(slot.id, slot);
  }

  async upsertLead(lead: Omit<Lead, 'id' | 'createdAt'>): Promise<void> {
    const key = `${lead.tenantId}:${lead.igUserId}`;
    const existing = this.leads.get(key);
    if (!existing) {
      this.leads.set(key, { ...lead, id: randomUUID(), createdAt: new Date() });
    }
  }

  async listLeads(tenantId: string): Promise<Lead[]> {
    return [...this.leads.values()].filter((l) => l.tenantId === tenantId);
  }

  async markCommentProcessed(tenantId: string, commentId: string): Promise<boolean> {
    const key = `${tenantId}:${commentId}`;
    if (this.processedComments.has(key)) return false;
    this.processedComments.add(key);
    return true;
  }

  async listKeywordRules(tenantId: string): Promise<KeywordRule[]> {
    return this.keywordRules.get(tenantId) ?? [];
  }

  async replaceKeywordRules(tenantId: string, rules: KeywordRule[]): Promise<void> {
    this.keywordRules.set(tenantId, rules);
  }

  async addContentFeedback(feedback: ContentFeedback): Promise<void> {
    this.feedback.push(feedback);
  }

  async listRecentRejectionReasons(tenantId: string, limit = 5): Promise<string[]> {
    return this.feedback
      .filter((f) => f.tenantId === tenantId && f.verdict === 'rejected' && f.reason)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((f) => f.reason!);
  }

  async getAutonomy(tenantId: string): Promise<AutonomyConfig | null> {
    return this.autonomyConfigs.get(tenantId) ?? null;
  }

  async saveAutonomy(tenantId: string, config: AutonomyConfig): Promise<void> {
    this.autonomyConfigs.set(tenantId, config);
  }

  async close(): Promise<void> {
    // nada que cerrar
  }
}
