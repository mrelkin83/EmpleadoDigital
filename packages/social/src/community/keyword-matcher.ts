/**
 * Matcher de keywords para community management (spec §26).
 * Adaptado de juancadile/instabot: tres modos de matching (exact, contains,
 * word_boundary) con prioridad y aliases. Las reglas son configuración por
 * tenant, no código duro (spec §6).
 */
export type MatchType = 'exact' | 'contains' | 'word_boundary';

export interface KeywordRule {
  id: string;
  keyword: string;
  aliases: string[];
  matchType: MatchType;
  priority: number; // menor número = mayor prioridad
  enabled: boolean;
  cooldownMinutes: number;
  /** Respuesta sugerida; su envío SIEMPRE pasa por el Policy Engine y la matriz de aprobación. */
  responseTemplate: string;
}

export class KeywordMatcher {
  private rules: KeywordRule[] = [];

  load(rules: KeywordRule[]): void {
    this.rules = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);
  }

  match(text: string): KeywordRule | null {
    const trimmed = text.trim();
    for (const rule of this.rules) {
      for (const kw of [rule.keyword, ...rule.aliases]) {
        if (isMatch(trimmed, kw, rule.matchType)) return rule;
      }
    }
    return null;
  }
}

function isMatch(text: string, keyword: string, matchType: MatchType): boolean {
  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  switch (matchType) {
    case 'exact':
      return lowerText === lowerKeyword;
    case 'contains':
      return lowerText.includes(lowerKeyword);
    case 'word_boundary': {
      const escaped = lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
    }
  }
}
