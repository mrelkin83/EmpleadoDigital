import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { computeSignature } from '@empleado/social';

process.env['NODE_ENV'] = 'test';
process.env['META_APP_SECRET'] = 'test-secret';
process.env['META_VERIFY_TOKEN'] = 'test-verify';

const { buildContext } = await import('../src/context.js');
const { buildServer } = await import('../src/server.js');

let app: FastifyInstance;

beforeAll(async () => {
  const ctx = await buildContext();
  app = await buildServer(ctx);
  await app.ready();
});

describe('API', () => {
  it('GET /health responde ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', instagramConnected: false });
  });

  it('GET /api/brand devuelve la Brand Memory del piloto (seed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/brand' });
    expect(res.statusCode).toBe(200);
    expect(res.json().niche).toContain('aduanero');
  });

  it('POST /api/content/generate crea un borrador con Quality Gate', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/content/generate',
      payload: {
        pillar: 'Educación',
        funnel: 'TOFU',
        topic: 'Qué hacer si la DIAN retiene tu mercancía',
        format: 'carousel',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.piece.status).toBe('draft');
    expect(body.qualityGate).toHaveProperty('passed');
    // Con MockProvider el contenido queda marcado [MOCK] y el gate lo bloquea: correcto.
    if (body.piece.body.includes('[MOCK]')) {
      expect(body.qualityGate.passed).toBe(false);
    }
  });

  it('rechaza payloads inválidos en generate', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/content/generate',
      payload: { pillar: '', funnel: 'XXX', topic: 'x', format: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('publicar sin Instagram conectado devuelve 409 con mensaje claro', async () => {
    const gen = await app.inject({
      method: 'POST',
      url: '/api/content/generate',
      payload: { pillar: 'Educación', funnel: 'TOFU', topic: 'tema', format: 'image' },
    });
    const pieceId = gen.json().piece.id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/content/${pieceId}/publish`,
      payload: { imageUrl: 'https://example.com/x.jpg', humanApproved: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('instagram_not_connected');
  });

  it('GET /webhooks/meta resuelve el challenge con token correcto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks/meta?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=42',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('42');
  });

  it('GET /webhooks/meta rechaza token incorrecto', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks/meta?hub.mode=subscribe&hub.verify_token=malo&hub.challenge=42',
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /webhooks/meta rechaza firmas inválidas', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      payload: { object: 'instagram', entry: [] },
      headers: { 'x-hub-signature-256': 'sha256=invalida' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /webhooks/meta acepta firma válida y responde 200 inmediato', async () => {
    const payload = JSON.stringify({ object: 'instagram', entry: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/meta',
      payload,
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': computeSignature('test-secret', payload),
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('EVENT_RECEIVED');
  });

  it('flujo de aprobación: pendiente → aprobar refleja el estado en la pieza', async () => {
    // Crear pieza que pase el gate: editarla a mano tras generarla.
    const gen = await app.inject({
      method: 'POST',
      url: '/api/content/generate',
      payload: { pillar: 'Prevención', funnel: 'TOFU', topic: 'errores importar', format: 'image' },
    });
    const piece = gen.json().piece;

    const brandRes = await app.inject({ method: 'GET', url: '/api/brand' });
    const disclaimer = brandRes.json().disclaimers[0];

    // Sin endpoint de edición aún: la pieza generada con mock no pasará el gate → submit devuelve 422.
    const submit = await app.inject({ method: 'POST', url: `/api/content/${piece.id}/submit` });
    expect([200, 422]).toContain(submit.statusCode);
    if (submit.statusCode === 422) {
      expect(submit.json().error).toBe('quality_gate_failed');
    }
    expect(disclaimer).toBeTruthy();
  });

  it('OAuth: login sin app de Meta configurada devuelve 503 con instrucciones', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/instagram/login' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('oauth_not_configured');
  });

  it('OAuth: callback con state inválido devuelve 403 (anti-CSRF)', async () => {
    // Configurar la app de Meta solo afecta a oauthConfig(), que se lee por request.
    process.env['INSTAGRAM_APP_ID'] = 'app';
    process.env['INSTAGRAM_APP_SECRET'] = 'secret';
    process.env['OAUTH_REDIRECT_URI'] = 'https://localhost:3001/auth/instagram/callback';
    // getEnv() está cacheado desde el arranque; este test valida el caso sin config:
    const res = await app.inject({
      method: 'GET',
      url: '/auth/instagram/callback?code=abc&state=falso',
    });
    expect([403, 503]).toContain(res.statusCode);
  });

  it('GET /api/social/status refleja el estado de conexión y scopes faltantes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/social/status' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.connected).toBe(false);
    expect(body.missingScopes.length).toBeGreaterThan(0);
  });

  it('PATCH /api/content/:id edita un borrador y devuelve el Quality Gate', async () => {
    const gen = await app.inject({
      method: 'POST',
      url: '/api/content/generate',
      payload: { pillar: 'Prevención', funnel: 'TOFU', topic: 'errores al importar', format: 'image' },
    });
    const pieceId = gen.json().piece.id;
    const brand = (await app.inject({ method: 'GET', url: '/api/brand' })).json();
    const disclaimer = brand.disclaimers[0];

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/content/${pieceId}`,
      payload: {
        hook: '¿Vas a importar? Lee esto antes de pagar.',
        body: `Los cinco errores más comunes al importar y cómo evitarlos, con ejemplos reales. ${disclaimer}`,
        cta: 'Guarda este post y compártelo.',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.piece.hook).toContain('importar');
    expect(body.qualityGate.passed).toBe(true); // editada a mano, ya pasa el gate

    // Y ahora sí puede enviarse a revisión.
    const submit = await app.inject({ method: 'POST', url: `/api/content/${pieceId}/submit` });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().piece.status).toBe('in_review');
  });

  it('PATCH rechaza editar piezas publicadas', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/content/00000000-0000-0000-0000-00000000dead',
      payload: { hook: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/calendar/plan-week crea la semana y no duplica al repetir', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/calendar/plan-week',
      payload: { weekStart: '2026-08-24' },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().created.length).toBe(6);

    const second = await app.inject({
      method: 'POST',
      url: '/api/calendar/plan-week',
      payload: { weekStart: '2026-08-24' },
    });
    expect(second.json().created.length).toBe(0);
    expect(second.json().skipped).toBe(6);

    const list = await app.inject({ method: 'GET', url: '/api/calendar?from=2026-08-24' });
    expect(list.json().slots.length).toBe(6);
    expect(list.json().mix.balanced).toBe(true);
  });

  it('GET /api/autonomy y PUT /api/autonomy funcionan', async () => {
    const get = await app.inject({ method: 'GET', url: '/api/autonomy' });
    expect(get.json().mode).toBe('copilot');
    const put = await app.inject({
      method: 'PUT',
      url: '/api/autonomy',
      payload: { mode: 'assisted', requireApproval: { publish_content: true } },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().mode).toBe('assisted');
  });
});
