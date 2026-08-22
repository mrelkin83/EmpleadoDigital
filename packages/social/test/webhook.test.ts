import { describe, expect, it } from 'vitest';
import {
  computeSignature,
  isValidSignature,
  parseWebhookPayload,
  resolveVerificationChallenge,
} from '@empleado/social';

describe('verificación de firma de webhooks', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ object: 'instagram', entry: [] });

  it('acepta una firma válida', () => {
    const sig = computeSignature(secret, body);
    expect(isValidSignature(secret, body, sig)).toBe(true);
  });

  it('rechaza firma inválida, ausente o con secret distinto', () => {
    expect(isValidSignature(secret, body, 'sha256=deadbeef')).toBe(false);
    expect(isValidSignature(secret, body, undefined)).toBe(false);
    expect(isValidSignature('otro-secret', body, computeSignature(secret, body))).toBe(false);
  });

  it('resuelve el challenge de Meta solo con token correcto', () => {
    expect(
      resolveVerificationChallenge('vtoken', { mode: 'subscribe', token: 'vtoken', challenge: '123' }),
    ).toBe('123');
    expect(
      resolveVerificationChallenge('vtoken', { mode: 'subscribe', token: 'malo', challenge: '123' }),
    ).toBeNull();
  });
});

describe('parser de webhooks', () => {
  it('extrae eventos de comentario', () => {
    const events = parseWebhookPayload({
      object: 'instagram',
      entry: [
        {
          changes: [
            {
              field: 'comments',
              value: {
                id: 'c1',
                media: { id: 'm1' },
                from: { id: 'u1', username: 'importador_col' },
                text: 'INFO por favor',
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'comment', commentId: 'c1', text: 'INFO por favor' });
  });

  it('extrae mensajes directos e ignora echoes', () => {
    const events = parseWebhookPayload({
      object: 'instagram',
      entry: [
        {
          messaging: [
            { sender: { id: 'u2' }, message: { text: 'hola' } },
            { sender: { id: 'me' }, message: { text: 'eco', is_echo: true } },
          ],
        },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'message', senderId: 'u2', text: 'hola' });
  });

  it('tolera payloads malformados sin lanzar', () => {
    expect(parseWebhookPayload(null)).toEqual([]);
    expect(parseWebhookPayload({})).toEqual([]);
    expect(parseWebhookPayload({ entry: [{}] })).toEqual([]);
  });
});
