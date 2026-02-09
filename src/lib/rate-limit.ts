const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 30;
const RESTRICTED_MAX = 5;

const store = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(userId: string, isRestricted: boolean) {
  const now = Date.now();
  const limit = isRestricted ? RESTRICTED_MAX : MAX_REQUESTS;
  const entry = store.get(userId);

  if (!entry || now > entry.resetAt) {
    store.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}
