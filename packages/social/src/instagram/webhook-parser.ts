/**
 * Parser de payloads de webhooks de Instagram (Meta).
 * Estructura adaptada de juancadile/instabot, tipada de forma defensiva:
 * los payloads externos nunca se asumen bien formados.
 */
export interface MetaCommentEvent {
  type: 'comment';
  commentId: string;
  mediaId?: string;
  from: { id: string; username: string };
  text: string;
}

export interface MetaMessageEvent {
  type: 'message';
  senderId: string;
  text?: string;
}

export interface MetaMentionEvent {
  type: 'mention';
  mediaId?: string;
  commentId?: string;
}

export type MetaWebhookEvent = MetaCommentEvent | MetaMessageEvent | MetaMentionEvent;

interface RawWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        id?: string;
        media?: { id?: string };
        media_id?: string;
        comment_id?: string;
        from?: { id?: string; username?: string };
        text?: string;
      };
    }>;
    messaging?: Array<{
      sender?: { id?: string };
      message?: { text?: string; is_echo?: boolean };
    }>;
  }>;
}

export function parseWebhookPayload(payload: unknown): MetaWebhookEvent[] {
  const events: MetaWebhookEvent[] = [];
  const p = payload as RawWebhookPayload;
  if (!p?.entry) return events;

  for (const entry of p.entry) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      if (change.field === 'comments' && value.from?.id && value.id && value.text !== undefined) {
        events.push({
          type: 'comment',
          commentId: value.id,
          ...(value.media?.id ? { mediaId: value.media.id } : {}),
          from: { id: value.from.id, username: value.from.username ?? '' },
          text: value.text,
        });
      } else if (change.field === 'mentions') {
        events.push({
          type: 'mention',
          ...(value.media_id ? { mediaId: value.media_id } : {}),
          ...(value.comment_id ? { commentId: value.comment_id } : {}),
        });
      }
    }

    for (const msg of entry.messaging ?? []) {
      if (msg.sender?.id && !msg.message?.is_echo) {
        events.push({
          type: 'message',
          senderId: msg.sender.id,
          ...(msg.message?.text !== undefined ? { text: msg.message.text } : {}),
        });
      }
    }
  }

  return events;
}
