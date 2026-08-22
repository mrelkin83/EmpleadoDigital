import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryUsageSink, TaskRouter } from '@empleado/ai-core';
import { MockProvider } from '@empleado/ai-providers';
import { buildPilotBrandMemory } from '@empleado/brand';
import type { ContentPiece } from '@empleado/content';
import { SocialPolicyEngine, type InstagramConnector, type PolicyContext } from '@empleado/social';
import { ApprovalRequiredError, PolicyViolationError, DEFAULT_AUTONOMY } from '@empleado/shared';
import { classifyComment, generateCaption, publishPost } from '@empleado/skills';

const brand = buildPilotBrandMemory('t1');
const DISCLAIMER = brand.disclaimers[0]!;

function makeRouter(provider = new MockProvider()) {
  return { provider, router: new TaskRouter([provider], new InMemoryUsageSink()) };
}

describe('generate_caption', () => {
  it('genera un borrador con metadata y trazabilidad; nunca sale aprobado', async () => {
    const { provider, router } = makeRouter();
    provider.enqueue(
      JSON.stringify({ hook: 'Hook de prueba', body: 'Cuerpo de prueba', cta: 'CTA de prueba' }),
    );
    const piece = await generateCaption(router, {
      tenantId: 't1',
      brand,
      pillar: 'Educación',
      funnel: 'TOFU',
      topic: 'Qué hacer si la DIAN retiene tu mercancía',
      format: 'carousel',
    });
    expect(piece.status).toBe('draft');
    expect(piece.approval).toBe('pending');
    expect(piece.hook).toBe('Hook de prueba');
    expect(piece.generatedBy?.provider).toBe('mock');
  });

  it('si la salida no es JSON válido, la conserva como cuerpo para revisión humana', async () => {
    const { provider, router } = makeRouter();
    provider.enqueue('texto libre sin estructura');
    const piece = await generateCaption(router, {
      tenantId: 't1',
      brand,
      pillar: 'Educación',
      funnel: 'TOFU',
      topic: 'tema',
      format: 'image',
    });
    expect(piece.body).toBe('texto libre sin estructura');
    expect(piece.hook).toBe('');
  });
});

describe('classify_comment', () => {
  it('clasifica y respeta el escalamiento humano obligatorio', async () => {
    const { provider, router } = makeRouter();
    provider.enqueue(JSON.stringify({ category: 'riesgo_reputacional', requiresHuman: false }));
    const result = await classifyComment(router, 't1', 'esto es una estafa, los voy a denunciar');
    expect(result.category).toBe('riesgo_reputacional');
    expect(result.requiresHuman).toBe(true); // la política manda sobre el modelo
  });

  it('ante salida inválida del modelo, escala a humano (fallback seguro)', async () => {
    const { provider, router } = makeRouter();
    provider.enqueue('no soy json');
    const result = await classifyComment(router, 't1', 'hola');
    expect(result.requiresHuman).toBe(true);
  });
});

describe('publish_post', () => {
  const FULL_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

  function approvedPiece(): ContentPiece {
    const now = new Date();
    return {
      id: randomUUID(),
      tenantId: 't1',
      format: 'image',
      pillar: 'Prevención',
      funnel: 'TOFU',
      topic: 'Errores al importar',
      hook: '¿Vas a importar? Lee esto antes.',
      body: `Los errores más comunes al importar y cómo evitarlos, explicados de forma simple. ${DISCLAIMER}`,
      cta: 'Guarda este post.',
      status: 'approved',
      approval: 'approved',
      createdAt: now,
      updatedAt: now,
    };
  }

  const fakeConnector = {
    publishImage: async () => ({ mediaId: 'media-123', permalink: 'https://instagram.com/p/x' }),
  } as unknown as InstagramConnector;

  function policyCtx(mode: 'copilot' | 'autonomous'): PolicyContext {
    return {
      tenantId: 't1',
      grantedScopes: FULL_SCOPES,
      autonomy:
        mode === 'copilot'
          ? DEFAULT_AUTONOMY
          : { mode: 'autonomous', requireApproval: { publish_content: false } },
    };
  }

  it('publica una pieza aprobada cuando la autonomía lo permite', async () => {
    const result = await publishPost(fakeConnector, new SocialPolicyEngine(), {
      piece: approvedPiece(),
      brand,
      imageUrl: 'https://example.com/img.jpg',
      policyContext: policyCtx('autonomous'),
      humanApproved: false,
    });
    expect(result.mediaId).toBe('media-123');
    expect(result.piece.status).toBe('published');
  });

  it('exige aprobación humana en modo copiloto', async () => {
    await expect(
      publishPost(fakeConnector, new SocialPolicyEngine(), {
        piece: approvedPiece(),
        brand,
        imageUrl: 'https://example.com/img.jpg',
        policyContext: policyCtx('copilot'),
        humanApproved: false,
      }),
    ).rejects.toThrowError(ApprovalRequiredError);
  });

  it('con aprobación humana explícita, publica en modo copiloto', async () => {
    const result = await publishPost(fakeConnector, new SocialPolicyEngine(), {
      piece: approvedPiece(),
      brand,
      imageUrl: 'https://example.com/img.jpg',
      policyContext: policyCtx('copilot'),
      humanApproved: true,
    });
    expect(result.piece.status).toBe('published');
  });

  it('rechaza piezas que no pasan el Quality Gate', async () => {
    const bad = { ...approvedPiece(), body: 'corto' };
    await expect(
      publishPost(fakeConnector, new SocialPolicyEngine(), {
        piece: bad,
        brand,
        imageUrl: 'https://example.com/img.jpg',
        policyContext: policyCtx('autonomous'),
        humanApproved: true,
      }),
    ).rejects.toThrowError(PolicyViolationError);
  });

  it('rechaza piezas en estado draft (deben pasar por aprobación)', async () => {
    const draft = { ...approvedPiece(), status: 'draft' as const };
    await expect(
      publishPost(fakeConnector, new SocialPolicyEngine(), {
        piece: draft,
        brand,
        imageUrl: 'https://example.com/img.jpg',
        policyContext: policyCtx('autonomous'),
        humanApproved: true,
      }),
    ).rejects.toThrowError(PolicyViolationError);
  });
});
