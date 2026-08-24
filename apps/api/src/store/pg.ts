import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import type { BrandMemory } from '@empleado/brand';
import type { CalendarSlot, ContentPiece } from '@empleado/content';
import type { ActivityEntry } from '@empleado/shared';
import type { ApprovalRequest, Lead, Store, StoredSocialAccount } from './store.js';

/** Persistencia PostgreSQL. Esquema en /db/migrations (ejecutar npm run db:migrate). */
export class PgStore implements Store {
  /** Expuesto para componentes que comparten el pool (p. ej. PgUsageSink). */
  readonly sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 10 });
  }

  /** Garantiza que el tenant exista (MVP: tenant único creado on-demand). */
  async ensureTenant(tenantId: string, name: string): Promise<void> {
    await this.sql`
      INSERT INTO tenants (id, name) VALUES (${tenantId}, ${name})
      ON CONFLICT (id) DO NOTHING`;
  }

  async getSocialAccount(tenantId: string, platform: string): Promise<StoredSocialAccount | null> {
    const rows = await this.sql`
      SELECT * FROM social_accounts WHERE tenant_id = ${tenantId} AND platform = ${platform}`;
    if (!rows.length) return null;
    const r = rows[0]!;
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      platform: r['platform'] as 'instagram',
      externalAccountId: r['external_account_id'] as string,
      username: r['username'] as string,
      tokenEncrypted: r['token_encrypted'] as string,
      ...(r['token_expires_at'] ? { tokenExpiresAt: r['token_expires_at'] as Date } : {}),
      grantedScopes: (r['granted_scopes'] as string[]) ?? [],
      connectedAt: r['connected_at'] as Date,
    };
  }

  async saveSocialAccount(a: StoredSocialAccount): Promise<void> {
    await this.ensureTenant(a.tenantId, 'tenant');
    await this.sql`
      INSERT INTO social_accounts (id, tenant_id, platform, external_account_id, username,
        token_encrypted, token_expires_at, granted_scopes, connected_at)
      VALUES (${a.id}, ${a.tenantId}, ${a.platform}, ${a.externalAccountId}, ${a.username},
        ${a.tokenEncrypted}, ${a.tokenExpiresAt ?? null}, ${a.grantedScopes}, ${a.connectedAt})
      ON CONFLICT (tenant_id, platform) DO UPDATE SET
        external_account_id = EXCLUDED.external_account_id,
        username = EXCLUDED.username,
        token_encrypted = EXCLUDED.token_encrypted,
        token_expires_at = EXCLUDED.token_expires_at,
        granted_scopes = EXCLUDED.granted_scopes,
        connected_at = EXCLUDED.connected_at`;
  }

  async getBrand(tenantId: string): Promise<BrandMemory | null> {
    const rows = await this.sql`SELECT data FROM brand_memories WHERE tenant_id = ${tenantId}`;
    return rows.length ? (rows[0]!['data'] as BrandMemory) : null;
  }

  async saveBrand(memory: BrandMemory): Promise<void> {
    await this.ensureTenant(memory.tenantId, memory.brandName);
    await this.sql`
      INSERT INTO brand_memories (tenant_id, data, updated_at)
      VALUES (${memory.tenantId}, ${this.sql.json(memory as unknown as postgres.JSONValue)}, now())
      ON CONFLICT (tenant_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
  }

  async listContent(tenantId: string): Promise<ContentPiece[]> {
    const rows = await this.sql`
      SELECT * FROM content_pieces WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
    return rows.map(rowToPiece);
  }

  async getContent(tenantId: string, id: string): Promise<ContentPiece | null> {
    const rows = await this.sql`
      SELECT * FROM content_pieces WHERE tenant_id = ${tenantId} AND id = ${id}`;
    return rows.length ? rowToPiece(rows[0]!) : null;
  }

  async saveContent(p: ContentPiece): Promise<void> {
    await this.sql`
      INSERT INTO content_pieces (id, tenant_id, format, pillar, funnel, topic, hook, body, cta,
        status, approval, scheduled_at, published_media_id, media, generated_by, created_at, updated_at)
      VALUES (${p.id}, ${p.tenantId}, ${p.format}, ${p.pillar}, ${p.funnel}, ${p.topic}, ${p.hook},
        ${p.body}, ${p.cta}, ${p.status}, ${p.approval}, ${p.scheduledAt ?? null},
        ${p.publishedMediaId ?? null},
        ${p.media ? this.sql.json(p.media as unknown as postgres.JSONValue) : null},
        ${p.generatedBy ? this.sql.json(p.generatedBy as unknown as postgres.JSONValue) : null},
        ${p.createdAt}, ${p.updatedAt})
      ON CONFLICT (id) DO UPDATE SET
        format = EXCLUDED.format, pillar = EXCLUDED.pillar, funnel = EXCLUDED.funnel,
        topic = EXCLUDED.topic,
        hook = EXCLUDED.hook, body = EXCLUDED.body, cta = EXCLUDED.cta,
        status = EXCLUDED.status, approval = EXCLUDED.approval,
        scheduled_at = EXCLUDED.scheduled_at, published_media_id = EXCLUDED.published_media_id,
        media = EXCLUDED.media,
        updated_at = EXCLUDED.updated_at`;
  }

  async listActivity(tenantId: string, limit = 50): Promise<ActivityEntry[]> {
    const rows = await this.sql`
      SELECT * FROM activity_log WHERE tenant_id = ${tenantId} ORDER BY at DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      at: r['at'] as Date,
      actor: r['actor'] as string,
      summary: r['summary'] as string,
      ...(r['explanation']
        ? { explanation: r['explanation'] as NonNullable<ActivityEntry['explanation']> }
        : {}),
      kind: r['kind'] as ActivityEntry['kind'],
    }));
  }

  async addActivity(e: ActivityEntry): Promise<void> {
    await this.sql`
      INSERT INTO activity_log (id, tenant_id, at, actor, summary, explanation, kind)
      VALUES (${e.id}, ${e.tenantId}, ${e.at}, ${e.actor}, ${e.summary},
        ${e.explanation ? this.sql.json(e.explanation as unknown as postgres.JSONValue) : null}, ${e.kind})`;
  }

  async listApprovals(tenantId: string, status?: ApprovalRequest['status']): Promise<ApprovalRequest[]> {
    const rows = status
      ? await this.sql`SELECT * FROM approval_requests WHERE tenant_id = ${tenantId} AND status = ${status} ORDER BY created_at DESC`
      : await this.sql`SELECT * FROM approval_requests WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
    return rows.map(rowToApproval);
  }

  async getApproval(tenantId: string, id: string): Promise<ApprovalRequest | null> {
    const rows = await this.sql`
      SELECT * FROM approval_requests WHERE tenant_id = ${tenantId} AND id = ${id}`;
    return rows.length ? rowToApproval(rows[0]!) : null;
  }

  async saveApproval(a: ApprovalRequest): Promise<void> {
    await this.sql`
      INSERT INTO approval_requests (id, tenant_id, kind, resource_id, summary, status, created_at, resolved_at)
      VALUES (${a.id}, ${a.tenantId}, ${a.kind}, ${a.resourceId}, ${a.summary}, ${a.status}, ${a.createdAt}, ${a.resolvedAt ?? null})
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, resolved_at = EXCLUDED.resolved_at`;
  }

  async listCalendar(tenantId: string, fromDate?: string): Promise<CalendarSlot[]> {
    const rows = fromDate
      ? await this.sql`SELECT * FROM calendar_slots WHERE tenant_id = ${tenantId} AND date >= ${fromDate} ORDER BY date, time`
      : await this.sql`SELECT * FROM calendar_slots WHERE tenant_id = ${tenantId} ORDER BY date, time`;
    return rows.map((r) => ({
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      date: (r['date'] instanceof Date ? r['date'].toISOString().slice(0, 10) : String(r['date'])),
      time: r['time'] as string,
      format: r['format'] as CalendarSlot['format'],
      pillar: r['pillar'] as string,
      funnel: r['funnel'] as CalendarSlot['funnel'],
      topic: r['topic'] as string,
      objective: r['objective'] as string,
      channel: 'instagram',
      ...(r['content_piece_id'] ? { contentPieceId: r['content_piece_id'] as string } : {}),
      status: r['status'] as CalendarSlot['status'],
    }));
  }

  async saveCalendarSlot(s: CalendarSlot): Promise<void> {
    await this.sql`
      INSERT INTO calendar_slots (id, tenant_id, date, time, format, pillar, funnel, topic,
        objective, channel, content_piece_id, status)
      VALUES (${s.id}, ${s.tenantId}, ${s.date}, ${s.time}, ${s.format}, ${s.pillar}, ${s.funnel},
        ${s.topic}, ${s.objective}, ${s.channel}, ${s.contentPieceId ?? null}, ${s.status})
      ON CONFLICT (id) DO UPDATE SET
        date = EXCLUDED.date, time = EXCLUDED.time, topic = EXCLUDED.topic,
        content_piece_id = EXCLUDED.content_piece_id, status = EXCLUDED.status`;
  }

  async upsertLead(lead: Omit<Lead, 'id' | 'createdAt'>): Promise<void> {
    await this.sql`
      INSERT INTO leads (id, tenant_id, ig_user_id, ig_username, source, keyword_id)
      VALUES (${randomUUID()}, ${lead.tenantId}, ${lead.igUserId}, ${lead.igUsername}, ${lead.source}, ${lead.keywordId ?? null})
      ON CONFLICT (tenant_id, ig_user_id) DO NOTHING`;
  }

  async listLeads(tenantId: string): Promise<Lead[]> {
    const rows = await this.sql`SELECT * FROM leads WHERE tenant_id = ${tenantId} ORDER BY created_at DESC`;
    return rows.map((r) => ({
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      igUserId: r['ig_user_id'] as string,
      igUsername: r['ig_username'] as string,
      source: r['source'] as Lead['source'],
      ...(r['keyword_id'] ? { keywordId: r['keyword_id'] as string } : {}),
      createdAt: r['created_at'] as Date,
    }));
  }

  async markCommentProcessed(tenantId: string, commentId: string): Promise<boolean> {
    const result = await this.sql`
      INSERT INTO processed_comments (tenant_id, comment_id)
      VALUES (${tenantId}, ${commentId})
      ON CONFLICT DO NOTHING`;
    return result.count > 0;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

function rowToPiece(r: postgres.Row): ContentPiece {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    format: r['format'] as ContentPiece['format'],
    pillar: r['pillar'] as string,
    funnel: r['funnel'] as ContentPiece['funnel'],
    topic: r['topic'] as string,
    hook: r['hook'] as string,
    body: r['body'] as string,
    cta: r['cta'] as string,
    status: r['status'] as ContentPiece['status'],
    approval: r['approval'] as ContentPiece['approval'],
    ...(r['scheduled_at'] ? { scheduledAt: r['scheduled_at'] as Date } : {}),
    ...(r['published_media_id'] ? { publishedMediaId: r['published_media_id'] as string } : {}),
    ...(r['media'] ? { media: r['media'] as NonNullable<ContentPiece['media']> } : {}),
    ...(r['generated_by']
      ? { generatedBy: r['generated_by'] as NonNullable<ContentPiece['generatedBy']> }
      : {}),
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
  };
}

function rowToApproval(r: postgres.Row): ApprovalRequest {
  return {
    id: r['id'] as string,
    tenantId: r['tenant_id'] as string,
    kind: r['kind'] as ApprovalRequest['kind'],
    resourceId: r['resource_id'] as string,
    summary: r['summary'] as string,
    status: r['status'] as ApprovalRequest['status'],
    createdAt: r['created_at'] as Date,
    ...(r['resolved_at'] ? { resolvedAt: r['resolved_at'] as Date } : {}),
  };
}
