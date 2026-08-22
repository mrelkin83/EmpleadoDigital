import { describe, expect, it } from 'vitest';
import { SocialPolicyEngine, type PolicyContext } from '@empleado/social';
import { DEFAULT_AUTONOMY, type AutonomyConfig } from '@empleado/shared';

const engine = new SocialPolicyEngine();

const FULL_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_insights',
  'instagram_business_manage_comments',
  'instagram_business_content_publish',
  'instagram_business_manage_messages',
];

function ctx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    tenantId: 't1',
    grantedScopes: FULL_SCOPES,
    autonomy: DEFAULT_AUTONOMY,
    ...overrides,
  };
}

describe('SocialPolicyEngine', () => {
  it('bloquea SIEMPRE las acciones de nivel 4 (scraping, engagement falso, evasión)', () => {
    for (const action of [
      'scrape_followers',
      'scrape_likers',
      'scrape_commenters',
      'mass_follow',
      'mass_like',
      'mass_dm',
      'buy_followers',
      'fake_engagement',
      'evade_rate_limits',
    ] as const) {
      const decision = engine.evaluate(action, ctx());
      expect(decision.verdict).toBe('block');
      expect(decision.riskLevel).toBe(4);
    }
  });

  it('bloquea nivel 4 incluso en modo autónomo con todo permitido', () => {
    const autonomy: AutonomyConfig = {
      mode: 'autonomous',
      requireApproval: { publish_content: false, reply_dm: false },
    };
    const decision = engine.evaluate('scrape_followers', ctx({ autonomy }));
    expect(decision.verdict).toBe('block');
  });

  it('bloquea acciones si la cuenta no tiene los scopes requeridos', () => {
    const decision = engine.evaluate('publish_post', ctx({ grantedScopes: ['instagram_business_basic'] }));
    expect(decision.verdict).toBe('block');
    expect(decision.reasons[0]).toContain('instagram_business_content_publish');
  });

  it('bloquea acciones alimentadas por datos sin procedencia autorizada', () => {
    const decision = engine.evaluate('send_dm', {
      ...ctx({ autonomy: { mode: 'autonomous', requireApproval: { reply_dm: false } } }),
      dataProvenance: {
        source: 'lista externa',
        acquisitionMethod: 'unknown',
        authorizationStatus: 'unauthorized',
        collectedAt: new Date(),
      },
    });
    expect(decision.verdict).toBe('block');
  });

  it('en modo copiloto, publicar requiere revisión humana', () => {
    const decision = engine.evaluate('publish_post', ctx());
    expect(decision.verdict).toBe('human_review');
  });

  it('en modo autónomo con publish autorizado, permite publicar', () => {
    const autonomy: AutonomyConfig = { mode: 'autonomous', requireApproval: { publish_content: false } };
    const decision = engine.evaluate('publish_post', ctx({ autonomy }));
    expect(decision.verdict).toBe('allow');
  });

  it('las campañas pagadas requieren humano incluso en modo autónomo (regla always)', () => {
    const autonomy: AutonomyConfig = { mode: 'autonomous', requireApproval: { paid_campaign: false } };
    const decision = engine.evaluate('execute_paid_campaign', ctx({ autonomy }));
    expect(decision.verdict).toBe('human_review');
  });

  it('lecturas propias (nivel 1) se permiten sin fricción', () => {
    const decision = engine.evaluate('read_own_insights', ctx());
    expect(decision.verdict).toBe('allow');
  });
});
