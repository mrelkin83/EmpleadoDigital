import { describe, expect, it } from 'vitest';
import { actionRequiresApproval, DEFAULT_AUTONOMY } from '@empleado/shared';

describe('matriz de autonomía', () => {
  it('ideas y borradores nunca requieren aprobación', () => {
    expect(actionRequiresApproval('content_idea', DEFAULT_AUTONOMY)).toBe(false);
    expect(actionRequiresApproval('copy_draft', DEFAULT_AUTONOMY)).toBe(false);
  });

  it('campañas pagadas y cambios de presupuesto siempre requieren aprobación, sin excepción', () => {
    const permisivo = {
      mode: 'autonomous' as const,
      requireApproval: { paid_campaign: false, budget_change: false },
    };
    expect(actionRequiresApproval('paid_campaign', permisivo)).toBe(true);
    expect(actionRequiresApproval('budget_change', permisivo)).toBe(true);
    expect(actionRequiresApproval('strategy_change', permisivo)).toBe(true);
  });

  it('en copiloto, todo lo configurable requiere aprobación', () => {
    expect(actionRequiresApproval('publish_content', DEFAULT_AUTONOMY)).toBe(true);
    expect(actionRequiresApproval('reply_dm', DEFAULT_AUTONOMY)).toBe(true);
  });

  it('en autónomo, lo configurable respeta el override del tenant (default: aprobar)', () => {
    const auto = { mode: 'autonomous' as const, requireApproval: { publish_content: false } };
    expect(actionRequiresApproval('publish_content', auto)).toBe(false);
    expect(actionRequiresApproval('reply_dm', auto)).toBe(true); // sin override → aprobar
  });
});
