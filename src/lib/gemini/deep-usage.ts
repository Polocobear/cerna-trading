const MAX_DEEP_PER_DAY = 4;

interface DailyUsage {
  count: number;
  date: string;
}

const deepUsage = new Map<string, DailyUsage>();

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export function canUseDeepTier(userId: string): boolean {
  const today = getToday();
  const usage = deepUsage.get(userId);
  if (!usage || usage.date !== today) return true;
  return usage.count < MAX_DEEP_PER_DAY;
}

export function recordDeepUsage(userId: string): void {
  const today = getToday();
  const usage = deepUsage.get(userId);
  if (!usage || usage.date !== today) {
    deepUsage.set(userId, { count: 1, date: today });
  } else {
    usage.count++;
  }
}

export function getDeepUsageRemaining(userId: string): number {
  const today = getToday();
  const usage = deepUsage.get(userId);
  if (!usage || usage.date !== today) return MAX_DEEP_PER_DAY;
  return Math.max(0, MAX_DEEP_PER_DAY - usage.count);
}

export function getDeepLimit(): number {
  return MAX_DEEP_PER_DAY;
}
