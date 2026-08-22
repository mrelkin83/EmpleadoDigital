import { randomUUID } from 'node:crypto';
import type { BrandMemory } from '@empleado/brand';
import type { ContentPiece } from '@empleado/content';
import type { ActivityEntry } from '@empleado/shared';
import type { ApprovalRequest, Lead, Store } from './store.js';

/** Almacenamiento en memoria para desarrollo sin base de datos. No persistente. */
export class MemoryStore implements Store {
  private brands = new Map<string, BrandMemory>();
  private content = new Map<string, ContentPiece>();
  private activity: ActivityEntry[] = [];
  private approvals = new Map<string, ApprovalRequest>();
  private leads = new Map<string, Lead>();

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

  async close(): Promise<void> {
    // nada que cerrar
  }
}
