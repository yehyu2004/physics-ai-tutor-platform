// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "3600000", 10); // default 1 hour
const MAX_REQUESTS_NORMAL = parseInt(process.env.RATE_LIMIT_MAX_NORMAL || "30", 10);
const MAX_REQUESTS_RESTRICTED = parseInt(process.env.RATE_LIMIT_MAX_RESTRICTED || "10", 10);

export function checkRateLimit(userId: string, isRestricted: boolean): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const limit = isRestricted ? MAX_REQUESTS_RESTRICTED : MAX_REQUESTS_NORMAL;

  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }

  entry.count++;

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

export function getRateLimitInfo(userId: string, isRestricted: boolean): { count: number; limit: number; resetAt: number } {
  const limit = isRestricted ? MAX_REQUESTS_RESTRICTED : MAX_REQUESTS_NORMAL;
  const entry = rateLimitMap.get(userId);
  const now = Date.now();

  if (!entry || now > entry.resetAt) {
    return { count: 0, limit, resetAt: now + WINDOW_MS };
  }

  return { count: entry.count, limit, resetAt: entry.resetAt };
}
