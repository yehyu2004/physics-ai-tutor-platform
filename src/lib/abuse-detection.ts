import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { contentFlagStaffEmail, rateLimitAbuseStaffEmail } from "@/lib/email-templates";

// Jailbreak / prompt injection patterns (case-insensitive)
const CONTENT_FLAG_PATTERNS = [
  /ignore\s+(your|all|previous|prior)\s+(instructions|rules|guidelines)/i,
  /pretend\s+(you\s+are|to\s+be|you're)/i,
  /you\s+are\s+now\s+(a|an|no\s+longer)/i,
  /disregard\s+(your|all|previous|prior)\s+(instructions|rules)/i,
  /bypass\s+(your|the|any)\s+(restrictions|filters|safety)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+(restrictions|rules|guidelines)/i,
  /override\s+(your|the|system)\s+(prompt|instructions)/i,
  /forget\s+(your|all|previous)\s+(instructions|rules|training)/i,
];

// Dedup: max 1 notification per user per hour
const notificationCache = new Map<string, number>();
const NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

// Rate limit abuse tracking: count hits per user in the current hour
const rateLimitHitCache = new Map<string, { count: number; windowStart: number }>();
const RATE_ABUSE_THRESHOLD = 3; // 3+ hits in 1 hour = escalation
const RATE_ABUSE_WINDOW_MS = 60 * 60 * 1000;

// Clean up expired abuse-detection entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  notificationCache.forEach((ts, key) => {
    if (now - ts > NOTIFICATION_COOLDOWN_MS) notificationCache.delete(key);
  });
  rateLimitHitCache.forEach((entry, key) => {
    if (now - entry.windowStart > RATE_ABUSE_WINDOW_MS) rateLimitHitCache.delete(key);
  });
}, 60_000);

function shouldNotify(userId: string, type: string): boolean {
  const key = `${userId}:${type}`;
  const now = Date.now();
  const lastNotified = notificationCache.get(key);
  if (lastNotified && now - lastNotified < NOTIFICATION_COOLDOWN_MS) {
    return false;
  }
  notificationCache.set(key, now);
  return true;
}

async function getStaffEmails(): Promise<string[]> {
  const staff = await prisma.user.findMany({
    where: {
      role: { in: ["TA", "ADMIN"] },
      isBanned: false,
      isDeleted: false,
    },
    select: { email: true },
  });
  return staff.map((s) => s.email).filter(Boolean);
}

/**
 * Check message content for jailbreak/prompt injection patterns.
 * Returns matched patterns (empty array = clean).
 */
export function checkContentFlags(message: string): string[] {
  const flags: string[] = [];
  for (const pattern of CONTENT_FLAG_PATTERNS) {
    if (pattern.test(message)) {
      flags.push(pattern.source);
    }
  }
  return flags;
}

/**
 * Log a content flag to AuditLog and notify staff (fire-and-forget).
 */
export async function handleContentFlag(
  userId: string,
  userName: string,
  message: string,
  flags: string[]
) {
  await prisma.auditLog.create({
    data: {
      userId,
      action: "content_flag",
      details: {
        flags,
        messagePreview: message.slice(0, 200),
      },
    },
  });

  if (shouldNotify(userId, "content_flag")) {
    const staffEmails = await getStaffEmails();
    if (staffEmails.length > 0) {
      sendEmail({
        to: staffEmails,
        subject: `[PhysTutor] Content flag: ${userName.replace(/[\r\n]/g, "")}`,
        html: contentFlagStaffEmail({
          userName,
          userId,
          flags,
          messagePreview: message.slice(0, 500),
          adminUrl: process.env.NEXTAUTH_URL || "",
        }),
      }).catch((err) => console.error("[email] Failed to send content flag notification:", err));
    }
  }
}

/**
 * Track rate limit hits and escalate if threshold exceeded.
 * Call this each time a user hits the rate limit.
 */
export async function trackRateLimitAbuse(userId: string, userName: string) {
  const now = Date.now();
  const entry = rateLimitHitCache.get(userId);

  if (!entry || now - entry.windowStart > RATE_ABUSE_WINDOW_MS) {
    rateLimitHitCache.set(userId, { count: 1, windowStart: now });
    return;
  }

  entry.count++;

  if (entry.count >= RATE_ABUSE_THRESHOLD && shouldNotify(userId, "rate_abuse")) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: "abuse_detected",
        details: {
          type: "rate_limit_abuse",
          hitCount: entry.count,
          windowMinutes: 60,
        },
      },
    });

    const staffEmails = await getStaffEmails();
    if (staffEmails.length > 0) {
      sendEmail({
        to: staffEmails,
        subject: `[PhysTutor] Rate limit abuse: ${userName.replace(/[\r\n]/g, "")}`,
        html: rateLimitAbuseStaffEmail({
          userName,
          userId,
          hitCount: entry.count,
          adminUrl: process.env.NEXTAUTH_URL || "",
        }),
      }).catch((err) => console.error("[email] Failed to send rate abuse notification:", err));
    }
  }
}
