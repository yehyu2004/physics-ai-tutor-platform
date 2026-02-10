# AGENTS.md — Physics AI Tutor Platform

## Project Overview

Next.js 14 app with Prisma (PostgreSQL), NextAuth credentials + Google OAuth, OpenAI/Anthropic AI grading, and LaTeX rendering via `react-markdown` + `remark-math` + `rehype-katex`.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Database**: PostgreSQL via Prisma ORM (`@prisma/adapter-pg`)
- **Auth**: NextAuth v5 (credentials + Google)
- **AI**: OpenAI (`gpt-4o-mini`, `gpt-5.2`), Anthropic (`claude-sonnet-4-20250514`)
- **Styling**: Tailwind CSS, Radix UI, shadcn/ui
- **LaTeX**: `react-markdown`, `remark-math`, `rehype-katex`, `katex`

## Testing

### Prerequisites

1. PostgreSQL database running (see `docker-compose.yml`)
2. `.env` file configured with `DATABASE_URL` and `NEXTAUTH_SECRET`
3. Playwright + Chromium installed:
   ```bash
   npm install -D @playwright/test
   npx playwright install chromium
   ```

### E2E Test Mode

The app supports an `E2E_TEST_MODE` environment variable that bypasses NextAuth for Playwright tests:

- **Middleware** (`src/middleware.ts`): Skips JWT auth redirect when `E2E_TEST_MODE=true`
- **Session** (`src/lib/impersonate.ts`): `getEffectiveSession()` reads a `e2e-test-user-email` cookie and builds a fake session from the DB instead of using NextAuth

**⚠️ Never set `E2E_TEST_MODE=true` in production.**

### Running E2E Tests

```bash
# 1. Seed test data (creates test student + TA users, assignment, graded submission, appeal)
npx tsx e2e/seed-test-data.ts

# 2. Start the dev server with E2E test mode enabled
E2E_TEST_MODE=true npm run dev

# 3. Run Playwright tests (in a separate terminal)
npx playwright test

# Run with visible browser
npx playwright test --headed

# Run a specific test file
npx playwright test e2e/grading-latex-images.spec.ts

# View HTML report after tests
npx playwright show-report
```

### Test Users (seeded by `e2e/seed-test-data.ts`)

| Role    | Email                    | Password          |
|---------|--------------------------|--------------------|
| Student | `test-student@e2e.local` | `TestPassword123!` |
| TA      | `test-ta@e2e.local`      | `TestPassword123!` |

### Test Structure

```
e2e/
├── helpers.ts                      # loginAsTestUser(), loginAndGoto() helpers
├── seed-test-data.ts               # Seeds test users, assignment, graded submission, appeal
├── grading-latex-images.spec.ts    # Tests for LaTeX rendering + image attachments
└── fixtures/                       # Auto-generated test images (gitignored)
```

### Current Test Coverage

**`grading-latex-images.spec.ts`** — 6 tests:

- **Student: feedback renders LaTeX with KaTeX** — Verifies `.katex` elements exist in graded feedback
- **Student: appeal thread renders LaTeX with KaTeX** — Verifies LaTeX in appeal reason + TA reply
- **Student: can attach images to appeal reply** — Uploads image, verifies thumbnail preview
- **TA: grading page shows appeal and feedback content** — Verifies appeal section visible
- **TA: can attach images to grading feedback** — Uploads image to feedback area
- **TA: can attach images to appeal reply** — Uploads image to appeal reply area

### Writing New Tests

Use the cookie-based auth helper to skip login UI:

```typescript
import { loginAsTestUser, TEST_STUDENT_EMAIL } from "./helpers";

test("my test", async ({ page }) => {
  await loginAsTestUser(page.context(), TEST_STUDENT_EMAIL);
  await page.goto("/assignments");
  // ...
});
```

### Prisma Migrations

```bash
# Create a new migration after schema changes
npx prisma migrate dev --name <migration_name>

# Regenerate Prisma client
npx prisma generate
```
