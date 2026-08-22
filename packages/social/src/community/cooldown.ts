/**
 * Cooldowns y límites de frecuencia de mensajería (spec §32 rate limiting).
 * Adaptado de juancadile/instabot. Estos límites son conservadores por diseño:
 * previenen que respuestas autorizadas degeneren en spam (spec §8).
 */
export interface CooldownOptions {
  maxDmsPerHourPerUser?: number;
}

export class CooldownService {
  private readonly cooldowns = new Map<string, number>();
  private readonly hourlyCounters = new Map<string, { count: number; resetAt: number }>();
  private readonly maxDmsPerHour: number;

  constructor(options: CooldownOptions = {}) {
    this.maxDmsPerHour = options.maxDmsPerHourPerUser ?? 5;
  }

  isOnCooldown(userId: string, ruleId: string, cooldownMinutes: number): boolean {
    const last = this.cooldowns.get(`${userId}:${ruleId}`);
    if (!last) return false;
    return Date.now() - last < cooldownMinutes * 60_000;
  }

  isRateLimited(userId: string): boolean {
    const entry = this.hourlyCounters.get(userId);
    if (!entry || Date.now() >= entry.resetAt) return false;
    return entry.count >= this.maxDmsPerHour;
  }

  recordTrigger(userId: string, ruleId: string): void {
    this.cooldowns.set(`${userId}:${ruleId}`, Date.now());
    const now = Date.now();
    const entry = this.hourlyCounters.get(userId);
    if (!entry || now >= entry.resetAt) {
      this.hourlyCounters.set(userId, { count: 1, resetAt: now + 3_600_000 });
    } else {
      entry.count++;
    }
  }

  reset(): void {
    this.cooldowns.clear();
    this.hourlyCounters.clear();
  }
}
