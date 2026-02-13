# Senior Engineer Code Review: PhysTutor Platform

**Reviewer**: Senior Staff Engineer
**Date**: February 2026
**Scope**: Full codebase audit of `physics-ai-tutor-platform`

---

> This document is intended as candid, constructive feedback. The application clearly works and has a lot of thoughtful features (abuse detection, exam mode enforcement, grade appeals). The problems below are the kind of things that will hurt you in production, at scale, or when a second engineer joins the project. None of this is personal -- it is the difference between a working prototype and production software.

---

## Table of Contents

1. [Architecture & Structural Issues](#1-architecture--structural-issues)
2. [Security Vulnerabilities](#2-security-vulnerabilities)
3. [Database & Schema Design](#3-database--schema-design)
4. [API Layer Problems](#4-api-layer-problems)
5. [Frontend Anti-Patterns](#5-frontend-anti-patterns)
6. [State Management Chaos](#6-state-management-chaos)
7. [Error Handling (or Lack Thereof)](#7-error-handling-or-lack-thereof)
8. [Performance & Scalability](#8-performance--scalability)
9. [Testing & Quality Assurance](#9-testing--quality-assurance)
10. [Dependency & Build Concerns](#10-dependency--build-concerns)
11. [Code Duplication & DRY Violations](#11-code-duplication--dry-violations)
12. [What You Did Well](#12-what-you-did-well)

---

## 1. Architecture & Structural Issues

### 1.1 God Components

This is the single biggest problem in the codebase. Multiple page files are so large they are essentially entire applications crammed into one React component:

| File | Lines | What it does |
|------|-------|-------------|
| `src/app/(main)/assignments/[id]/page.tsx` | **1,859** | Submission form, file upload, appeals, LaTeX export, question rendering, grading display |
| `src/app/(main)/grading/page.tsx` | **1,448** | Assignment picker, submission list, per-question grading, overall scoring, appeal threads, autosave, localStorage sync |
| `src/app/(main)/chat/ChatPageClient.tsx` | **923** | Conversation sidebar, message list, streaming, model picker, image upload |
| `src/app/(main)/problems/generate/page.tsx` | **990** | Problem generation, rendering, editing |

**Why this matters**: A 1,859-line component is impossible to test in isolation, impossible to review in a PR, and guaranteed to produce merge conflicts when two people touch it. React's entire component model exists to prevent this.

**What to do**: Extract subcomponents ruthlessly. The grading page should be at minimum:
- `<SubmissionList>`
- `<GradingPanel>`
- `<AppealThread>` (shared with assignments page)
- `<OverallGradeForm>`
- `useGradingState()` custom hook (using `useReducer`)

### 1.2 No Separation Between Data and Presentation

Every page component fetches its own data inline with `useEffect` + `fetch()`. There is no data layer. No React Query. No SWR. No custom hooks abstracting API calls. Every single page reinvents the same pattern:

```tsx
// This exact pattern appears in 15+ files
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch("/api/something")
    .then(res => res.json())
    .then(data => setData(data))
    .catch(() => setLoading(false)); // silently swallow error
}, []);
```

This means:
- No request deduplication (same API hit from multiple components)
- No cache invalidation strategy
- No optimistic updates
- No retry logic
- No stale-while-revalidate
- Every page is a loading spinner on mount, every time

**What to do**: Pick React Query or SWR. Create typed hooks like `useAssignments()`, `useSubmissions(assignmentId)`. This one change would eliminate hundreds of lines of duplicated code.

### 1.3 No Shared Type System

Types are defined inline in each file. The grading page defines its own `SubmissionForGrading` interface. The assignments page defines its own `Assignment` interface. These are different shapes for what is conceptually the same data.

You have `src/types/index.ts` with exactly 2 types (`UserRole` and `SessionUser`) and it is barely used. Meanwhile, `UserRole` is re-declared as a string union in `src/lib/api-auth.ts:4`. You even have the `Role` enum in Prisma, but nobody imports the generated Prisma types on the frontend.

**What to do**: Create a `src/types/` directory with `assignment.ts`, `submission.ts`, `user.ts`, etc. Derive frontend types from the Prisma schema where possible. Stop re-declaring the same types in every file.

### 1.4 Business Logic in Route Handlers

API routes are 200-300 lines of procedural code mixing auth, validation, business logic, database queries, email sending, and audit logging. There is no service layer. Look at `src/app/api/grading/route.ts` -- it handles authentication, iterates over grades, creates or updates submission answers, recalculates total scores, saves overall feedback, calls AI for auto-grading, creates audit logs, and does all of this in a single function.

When you eventually need to grade submissions from a different entry point (webhook, cron job, CLI tool), you will have to duplicate all of this logic or extract it anyway.

---

## 2. Security Vulnerabilities

### 2.1 Path Traversal in LaTeX Export

**File**: `src/app/api/assignments/[id]/export-latex/route.ts`

```typescript
const imgPath = path.join(
  process.cwd(),
  "public",
  q.imageUrl.replace(/^\//, "")  // DANGEROUS
);
```

If `imageUrl` contains `../../etc/passwd`, this will happily read it. The `path.join()` call does not sanitize directory traversal sequences. You must validate that the resolved path is within the expected directory:

```typescript
const resolved = path.resolve(process.cwd(), "public", q.imageUrl.replace(/^\//, ""));
if (!resolved.startsWith(path.resolve(process.cwd(), "public"))) {
  throw new Error("Invalid path");
}
```

### 2.2 Cron Endpoints Are Optionally Authenticated

**Files**: `src/app/api/cron/send-scheduled-emails/route.ts`, `src/app/api/cron/publish-scheduled/route.ts`

```typescript
const cronSecret = process.env.CRON_SECRET;
if (cronSecret) {  // If not set, ANYONE can call this
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

This "only protect if configured" pattern is a trap. If someone deploys without setting `CRON_SECRET`, these endpoints are wide open. Anyone on the internet can trigger mass email sends or publish all scheduled assignments. The check should be:

```typescript
if (!cronSecret) {
  return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
}
```

### 2.3 Score Validation is Missing Everywhere

**Files**: `src/app/api/grading/route.ts`, `src/app/api/appeals/route.ts`

When grading or resolving appeals, scores are accepted from the client without any bounds checking:

```typescript
await prisma.submissionAnswer.create({
  data: {
    score: grade.score,  // Could be -1000 or 999999
  },
});
```

A malicious or buggy client can set scores to negative numbers, numbers exceeding the question's point value, or NaN. Always validate: `0 <= score <= question.points`.

### 2.4 E2E Test Mode Bypass

**File**: `src/middleware.ts`

```typescript
if (process.env.E2E_TEST_MODE === "true" && process.env.NODE_ENV !== "production") {
  return NextResponse.next();
}
```

The `NODE_ENV !== "production"` guard is good, but `E2E_TEST_MODE` is a footgun. If someone sets this on a staging environment (which is common -- staging often runs in non-production mode), all authentication is bypassed. This should be a compile-time flag, not a runtime environment variable, or at minimum should require an additional secret.

### 2.5 No Input Size Limits on Most Endpoints

The chat route validates message length (50,000 chars). Good. Almost no other endpoint does. The appeals route accepts `reason` with no length limit. The grading route accepts `feedback` with no length limit. The email routes accept `subject` and `message` with no length limit. A crafty user can send a 100MB JSON body to any of these endpoints.

### 2.6 Privilege Escalation Risk in User Management

**File**: `src/app/api/admin/users/route.ts`

The DELETE handler checks for `TA`, `PROFESSOR`, or `ADMIN` role but never verifies that the acting user outranks the target user. A TA can delete a Professor. A Professor can delete an Admin. The role hierarchy is not enforced.

---

## 3. Database & Schema Design

### 3.1 Missing Indexes

The `Assignment` model has no index on `createdById`, `published`, or `dueDate`. Every query that filters assignments by creator, publication status, or due date does a full table scan. With 100 assignments this is fine. With 10,000 it is not.

The `SubmissionAnswer` model has no index on `questionId`. The grading system groups by question frequently.

The `Submission` model has `@@index([assignmentId])` but no compound index on `[assignmentId, userId]`, which is the most common query pattern (find a user's submission for an assignment).

### 3.2 No Soft Delete Consistency

`User` has `isDeleted` + `deletedAt`. `Conversation` has `isDeleted` + `deletedAt`. But `Assignment`, `Submission`, `GradeAppeal`, and every other model can only be hard-deleted. This means:
- Deleting an assignment cascades to all submissions (student work is gone forever)
- There is no audit trail for deleted content
- There is no "undo" for accidental deletions

### 3.3 `Float` for Scores

`totalPoints`, `score`, and `points` are all `Float`. Floating point arithmetic is famously imprecise. A student who scores 0.1 + 0.2 points will have 0.30000000000000004 total. Use `Decimal` or store scores as integers (multiply by 100).

### 3.4 `Json` Columns Instead of Proper Relations

`recipientIds` in `ScheduledEmail`, `imageUrls` in `GradeAppeal` and `AppealMessage`, `answerImageUrls` and `feedbackImageUrls` in `SubmissionAnswer` -- all stored as `Json`. This means:
- No referential integrity (recipient IDs can reference deleted users)
- No ability to query by these fields efficiently
- No schema validation at the database level
- Prisma returns `any` types for these fields, losing type safety

### 3.5 `prisma db push --accept-data-loss` in the Build Script

```json
"build": "prisma generate && prisma db push --accept-data-loss && next build"
```

The `--accept-data-loss` flag means your build command can silently drop columns or tables. This is in your production build script. If you deploy a schema change that Prisma considers destructive, you will lose data in production with zero warning. This flag should never appear in a CI/CD pipeline. Use proper migrations (`prisma migrate deploy`).

### 3.6 No `updatedAt` on Most Models

Only `User`, `Conversation`, `GradeAppeal`, and `EmailTemplate` have `updatedAt`. The `Submission` model, which is actively updated during grading, has no `updatedAt`. Neither does `SubmissionAnswer`. You cannot tell when a grade was last modified.

---

## 4. API Layer Problems

### 4.1 Inconsistent Response Formats

Compare these responses from different endpoints:

```typescript
// Appeals: returns { success: true }
return NextResponse.json({ success: true });

// Same file, different action: returns { appeal: updated }
return NextResponse.json({ appeal: updated });

// Submissions: returns { submission }
return NextResponse.json({ submission });

// Grading: returns { success: true, submission }
return NextResponse.json({ success: true, submission });
```

There is no standard envelope. The client has to know the shape of each individual endpoint. Create a standard response format:

```typescript
type ApiResponse<T> = { data: T } | { error: string; status: number };
```

### 4.2 No Input Validation Library

Every route manually checks `if (!field) return 400`. There is no Zod, no Yup, no joi. This is error-prone and inconsistent. Some routes check for empty strings, some don't. Some validate array elements, some trust the client completely.

### 4.3 Pagination Is Inconsistent (When It Exists)

- `/api/assignments`: `take` + `skip` + `page` params (proper)
- `/api/admin/audit-log`: `take: 200`, no pagination at all
- `/api/notifications`: `take: 50`, no pagination
- `/api/admin/user-activity`: `range` parameter instead of page/cursor

Pick one pattern. Implement it once. Use it everywhere. Cursor-based pagination is generally better for real-time data.

### 4.4 Unbounded Queries

**File**: `src/app/api/admin/analytics/route.ts`

```typescript
prisma.message.findMany({
  select: { createdAt: true },
  take: 5000,  // Loads 5000 records into memory for charting
})
```

5000 records loaded and iterated in Node.js to compute histogram bins. This should be a SQL `GROUP BY DATE_TRUNC(...)` aggregation query or at minimum a Prisma `groupBy`.

### 4.5 Missing API Route for Protected Operations

The middleware matcher only protects page routes:

```typescript
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/chat/:path*",
    // ...pages only
  ],
};
```

API routes under `/api/` are not covered by the middleware. Each API route must do its own auth check via `requireApiAuth()`. If a developer forgets this call on a new route, it is silently unprotected. The middleware should also cover `/api/:path*` (except `/api/auth`).

---

## 5. Frontend Anti-Patterns

### 5.1 `window.alert()` and `window.confirm()` in 2026

```typescript
// Found in 15+ locations
alert("Failed to delete assignment");
if (!window.confirm("Are you sure?")) return;
```

These are blocking, unstyled, cannot be themed, break the UX, and are inaccessible. You have shadcn/ui installed. It includes `AlertDialog`. Use it. Or at minimum use a toast library (sonner is popular and tiny).

### 5.2 No Error Boundaries

There are zero React Error Boundaries in the entire application. If any child component throws during render (a null access, a bad prop), the entire page crashes to a white screen. At minimum, wrap the layout in an error boundary. Next.js App Router supports `error.tsx` files -- you have none.

### 5.3 No Loading/Error States in Route Files

Next.js App Router supports `loading.tsx` for Suspense boundaries and `error.tsx` for error boundaries at the route level. You have neither. Every page manages its own loading state manually with `useState(true)`.

### 5.4 Accessibility is an Afterthought

- Checkboxes without labels (grading page, user management)
- Interactive elements (submission list items, expandable sections) that are `<div onClick>` instead of `<button>` -- not keyboard navigable
- No `role` attributes on custom list components
- No focus management when modals/dialogs open
- No skip navigation links
- Color contrast is untested

This is not a nice-to-have. If this platform is used at a university, accessibility compliance is likely a legal requirement (Section 508, WCAG 2.1 AA).

### 5.5 Hardcoded Strings Everywhere

Role labels, error messages, UI copy -- all hardcoded as string literals scattered across every file. This means:
- No i18n support possible without rewriting every file
- Typos in user-facing strings are invisible at compile time
- Changing a message requires finding every occurrence

---

## 6. State Management Chaos

### 6.1 The Grading Page Has 94+ Pieces of State

`src/app/(main)/grading/page.tsx` uses approximately 94 `useState` calls. This includes:

```typescript
grades, confirmedAnswers, overallScore, overallFeedback,
feedbackImages, appealMessages, appealNewScores, expandedAppeals,
appealImages, feedbackFile, feedbackFileUrl, saving, aiLoading,
overallGradeConfirmed, ...
```

This is a textbook case for `useReducer` with a well-defined state machine. The current approach means:
- State transitions are scattered across 20+ event handlers
- Impossible to reason about what state the page is in at any given moment
- Bug-prone because related state updates happen in separate `setState` calls (no batching guarantees for async updates in React 18)
- Impossible to serialize/restore page state reliably

### 6.2 localStorage Sync is Fragile

```typescript
// grading/page.tsx line 177
loadAllFromLocalStorage = useCallback((submissionId: string): any | null => {
```

The `any` return type means no type safety. The serialized shape is never validated on load. If you change the state shape (add a field, rename a field), old cached data will silently produce undefined values. Use Zod to validate on deserialization, or at minimum include a schema version.

### 6.3 Duplicated State Across Pages

The assignments page and the grading page both independently fetch and maintain assignment lists. If a TA creates an assignment on one page, the other page does not know about it. There is no shared state, no cache layer, no event bus.

---

## 7. Error Handling (or Lack Thereof)

### 7.1 Silent `.catch(() => {})` Pattern

This appears **dozens** of times across the codebase:

```typescript
sendEmail({ ... }).catch(() => {});
trackRateLimitAbuse(userId, userName).catch(() => {});
handleContentFlag(userId, userName, message, contentFlags).catch(() => {});
```

I understand the intent -- these are "fire and forget" operations that should not block the main flow. But swallowing errors completely means you will never know when:
- Your email service goes down
- Your abuse detection system is broken
- Your audit logging is silently failing

At minimum, log the error:

```typescript
sendEmail({ ... }).catch(err => console.error("[email] Failed to send:", err));
```

### 7.2 No Structured Logging

Every error is `console.error("Some context:", error)`. There is no structured logging. No log levels. No correlation IDs. No request context. When you are debugging a production issue at 2 AM, `console.error("Chat error:", error)` in a serverless log stream is nearly useless.

Consider pino or winston with structured JSON output. Include request IDs, user IDs, and timestamps in every log entry.

### 7.3 Generic Error Responses Hide Root Causes

```typescript
catch (error) {
  console.error("Chat error:", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
```

Every route does this. The client gets "Internal server error" regardless of whether it was a database timeout, an AI API rate limit, a validation error, or a null pointer exception. Different errors require different client-side responses (retry vs. show message vs. redirect to login).

---

## 8. Performance & Scalability

### 8.1 In-Memory Rate Limiting Leaks Memory

**File**: `src/lib/rate-limit.ts`

```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
```

This Map is never cleaned up. Old entries with expired `resetAt` values accumulate forever. Same problem in `src/lib/abuse-detection.ts` with two more Maps. In a long-running server process, this is a slow memory leak. In a serverless environment (Vercel), this is even worse -- the Map resets on every cold start, making rate limiting unreliable.

**What to do**: Use Redis for rate limiting in production. Or at minimum, add periodic cleanup:

```typescript
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, 60_000);
```

### 8.2 No Database Connection Pooling Configuration

**File**: `src/lib/prisma.ts`

```typescript
const adapter = new PrismaPg({ connectionString });
return new PrismaClient({ adapter });
```

No connection pool size configuration. No statement timeout. No query logging in development. Under load, the default pool can exhaust database connections. The Prisma client should be configured with:
- `connection_limit` appropriate for your deployment
- Query logging in development for catching N+1 queries

### 8.3 Probabilistic Cleanup is Wrong

**File**: `src/app/api/activity/route.ts`

```typescript
async function maybeCleanupOldRecords() {
  if (Math.random() > 0.01) return;  // 1% chance
  await prisma.userActivity.deleteMany({
    where: { createdAt: { lt: oneYearAgo } },
  }).catch(() => {});
}
```

On 1% of requests, you run a potentially massive DELETE query that could lock tables and slow down the request. On the other 99%, old records accumulate. This is the worst of both worlds. Use a cron job.

### 8.4 No File Upload Size Limits

**File**: `src/app/api/upload/route.ts`

The upload endpoint has no rate limiting and relies on a hardcoded 20MB limit:

```typescript
if (file.size > 20 * 1024 * 1024) {
  return NextResponse.json({ error: "File too large..." }, { status: 413 });
}
```

But this check happens *after* the entire file has been read into memory. A user can exhaust server memory by uploading many large files concurrently. Next.js does not stream multipart uploads by default. Consider using signed upload URLs (S3/Vercel Blob presigned URLs) so files go directly to storage without passing through your server.

### 8.5 Title Generation Blocks the Stream

**File**: `src/app/api/chat/route.ts:213-237`

After streaming the AI response, the chat route makes a *synchronous* API call to Anthropic to generate a conversation title. This blocks the SSE stream's `done` event until the title API call completes (could be 1-3 seconds). The client is stuck waiting. Generate titles asynchronously or in a background job.

---

## 9. Testing & Quality Assurance

### 9.1 Near-Zero Test Coverage

The only tests are E2E tests in the `e2e/` directory, and from the git status, this appears to be a minimal setup. There are:
- **Zero unit tests** for business logic (grading calculations, score validation, role checks)
- **Zero integration tests** for API routes
- **Zero component tests** for React components

The grading page alone has enough logic to justify 50+ unit tests. Score calculations, autograding, appeal resolution, permission checks -- all of this is untested.

### 9.2 No Type Checking in CI

There is no `tsc --noEmit` in the build or lint scripts. TypeScript errors can accumulate without anyone noticing, especially with the many `any` types and `@ts-ignore` style suppressions (the `eslint-disable-next-line @typescript-eslint/no-explicit-any` pattern appears throughout the chat route).

### 9.3 ESLint Config is Minimal

The linter is `next lint` with no custom rules. No `@typescript-eslint/strict`, no `no-floating-promises`, no `no-unused-vars` at error level. The codebase has unused imports and unhandled promises that a stricter config would catch.

---

## 10. Dependency & Build Concerns

### 10.1 next-auth is on a Beta Version

```
next-auth@5.0.0-beta.30
```

A beta dependency in production. API surfaces may change between beta releases. The beta has known issues and is not covered by any stability guarantee. This is a risk.

### 10.2 Heavy 3D Dependencies for Minimal Use

```
@react-three/drei@10.7.7
@react-three/fiber@9.5.0
three@0.182.0
@types/three@0.182.0
matter-js@0.20.0
```

Three.js and React Three Fiber are massive bundles (400KB+ gzipped). These are used for physics simulations. If the simulations are Canvas-based (as the CLAUDE.md suggests), these 3D libraries may be loaded but barely used, or loaded on every page via the bundle. Ensure they are dynamically imported and code-split.

### 10.3 Mermaid is 2MB+

```
mermaid@11.12.2
```

Mermaid is a diagramming library weighing ~2MB. Unless every user needs diagrams on every page, this should be lazy-loaded.

### 10.4 No Lock File Mentioned in CI

There is no `npm ci` in the build script (only `prisma generate && prisma db push && next build`). If `package-lock.json` drifts or is not committed, builds are non-deterministic.

---

## 11. Code Duplication & DRY Violations

### 11.1 Role Checks Duplicated 15+ Times

```typescript
const isStaff = userRole === "TA" || userRole === "ADMIN" || userRole === "PROFESSOR";
```

This exact pattern appears in at least 15 locations across both frontend pages and API routes. Create a utility:

```typescript
export const STAFF_ROLES: UserRole[] = ["TA", "PROFESSOR", "ADMIN"];
export const isStaff = (role: UserRole) => STAFF_ROLES.includes(role);
```

### 11.2 Pagination Controls Duplicated 3 Times

The assignments page, grading page, and admin users page all implement their own pagination UI with gap indicators, page buttons, and previous/next controls. This should be a single `<Pagination>` component.

### 11.3 Appeal Thread UI Duplicated Between Pages

The assignments detail page and grading page both render appeal message threads with nearly identical markup. Extract an `<AppealThread>` component.

### 11.4 Fetch Wrapper Duplicated Everywhere

Instead of a shared `apiFetch()` utility that handles auth errors, JSON parsing, and error responses, every page has its own inline fetch with different error handling approaches.

### 11.5 HTML Email Templates Inline in TypeScript

**Files**: `src/lib/spam-guard.ts`, `src/lib/abuse-detection.ts`, `src/app/api/admin/email/route.ts`

Full HTML email templates are written as template literals inside TypeScript functions. These should be in separate template files (React Email, MJML, or at minimum separate `.html` files). This makes them impossible to preview, test, or modify without touching business logic.

---

## 12. What You Did Well

It is not all bad. Far from it. Credit where it is due:

1. **Auth pattern is solid**: The `requireApiAuth()` / `requireApiRole()` / `isErrorResponse()` pattern in `src/lib/api-auth.ts` is clean, composable, and well-typed. Every API route uses it consistently.

2. **CSRF protection in middleware**: The origin/host check for state-changing methods is correct and catches cross-origin attacks.

3. **Abuse detection system is thoughtful**: Jailbreak pattern detection, rate limit escalation, automatic banning, staff notifications via email -- this shows real consideration for operational concerns.

4. **Conversation message limiting**: `take: 50` on chat history prevents unbounded token usage. Many AI apps get this wrong.

5. **Exam mode enforcement is server-side**: The system prompt is overridden on the server, not the client. Students cannot bypass it by modifying the frontend. This is the right approach.

6. **Prisma singleton pattern**: The `globalForPrisma` pattern in `src/lib/prisma.ts` prevents connection pool exhaustion during hot reloads. Standard but correctly implemented.

7. **Cascading deletes on the right models**: Conversations, messages, submissions -- these correctly cascade from their parent. Orphaned records are avoided.

8. **Activity tracking is well-designed**: The `UserActivity` model with category/detail/duration is flexible and the indexed queries make sense.

---

## Summary: The Top 5 Things to Fix First

If you can only do five things, do these:

1. **Fix the path traversal vulnerability** in the LaTeX export route. This is a security issue that can be exploited today.

2. **Make `CRON_SECRET` mandatory**, not optional. An unauthenticated cron endpoint can send mass emails.

3. **Add input validation** (Zod) to all API routes. Start with grading and appeals where unvalidated scores can corrupt data.

4. **Break up the god components**. The 1,859-line assignments page and 1,448-line grading page are maintenance nightmares. Extract subcomponents and shared hooks.

5. **Remove `--accept-data-loss` from the build script**. Switch to proper Prisma migrations before you lose production data.

Everything else on this list matters, but these five could cause real damage if left unaddressed.

---

*Written with the understanding that shipping is a virtue. A working application is worth more than a perfectly architected one that never launches. But now that it is working, it is time to harden it.*
