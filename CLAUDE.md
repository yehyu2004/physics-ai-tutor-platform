# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**See also**: [AGENTS.md](./docs/AGENTS.md) for detailed testing documentation and E2E test setup.

## Development Commands

```bash
# First-time setup
make setup              # Install deps, start DB, generate Prisma client, sync schema, start dev

# Development
make dev                # Start development server (auto-runs prisma generate & db push)
npm run dev             # Alternative: just start Next.js dev server

# Database
make db-up              # Start PostgreSQL in Docker
make db-push            # Sync Prisma schema to database (no migration files)
make db-studio          # Open Prisma Studio (database GUI)
npx prisma db push --accept-data-loss  # When adding nullable unique columns

# Build & Production
make build              # Build for production
make start              # Start production server

# Testing (see AGENTS.md for details)
npx tsx e2e/seed-test-data.ts          # Seed test users and data
E2E_TEST_MODE=true npm run dev         # Start dev server in test mode
npx playwright test                     # Run E2E tests
npx playwright test --headed            # Run with visible browser
npx playwright show-report              # View test results

# Linting
npm run lint            # Run Next.js linter
```

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 14 (App Router, TypeScript)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth.js v5 with custom `auth()` helper
- **AI**: Dual provider system (OpenAI + Anthropic) with admin-switchable backend
- **Styling**: TailwindCSS + shadcn/ui components
- **Code Execution**: Piston API (sandboxed, rate-limited)

### Project Structure

```
src/
  app/
    (auth)/          # Login & register pages (standalone, no sidebar)
    (main)/          # Authenticated pages wrapped in MainLayoutClient (sidebar + topbar)
    api/             # API routes organized by feature
      chat/          # Chat/conversation endpoints
      assignments/   # Assignment CRUD
      grading/       # Submission grading
      admin/         # User management, settings
      run-code/      # Code execution via Piston API
  components/
    ui/              # shadcn/ui components
    layout/          # Sidebar, Topbar
  lib/
    auth.ts          # NextAuth v5 configuration
    prisma.ts        # Prisma client singleton
    ai.ts            # AI provider abstraction (OpenAI + Anthropic)
prisma/
  schema.prisma      # Database schema (User, Assignment, Submission, etc.)
```

### Key Patterns

#### Authentication
- **Always use**: `import { auth } from "@/lib/auth"` then `const session = await auth()`
- **Never use**: `getServerSession` from `next-auth` — this project uses NextAuth v5
- Session user structure: `{ id, name, email, image, role }`
- Available roles: `STUDENT`, `TA`, `PROFESSOR`, `ADMIN`

#### AI Provider System
- Dual provider support (OpenAI GPT-5.2 + Anthropic Claude Haiku)
- Admin-switchable default provider via settings
- System prompts: `DEFAULT_SYSTEM_PROMPT`, `SOCRATIC_SYSTEM_PROMPT`, `EXAM_MODE_SYSTEM_PROMPT`
- Location: `src/lib/ai.ts`

#### Database & Prisma
- Use `npx prisma db push` for schema changes (no migration files workflow)
- When adding nullable unique columns, use `npx prisma db push --accept-data-loss`
- Prisma client is a singleton at `src/lib/prisma.ts`
- Main models: `User`, `Conversation`, `Message`, `Assignment`, `Question`, `Submission`, `GradeAppeal`

#### Styling & Theming
- Dark mode via `next-themes` with `class` strategy on `<html>`
- ThemeProvider wraps SessionProvider in root layout
- Consistent dark mode mappings: `bg-white → dark:bg-gray-950`, `bg-gray-50 → dark:bg-gray-900`
- CSS variables defined in `globals.css` under `.dark {}` block

#### Chat Features
- **LaTeX Rendering**: Uses `remark-math` + `rehype-katex` with click-to-copy functionality
- **Code Blocks**: Interactive with syntax highlighting, edit mode, and sandboxed execution
  - Supported languages for execution: Python, JavaScript, TypeScript
  - Rate limit: 20 executions per hour per user
  - API: `/api/run-code` → Piston API
- **Message Copy**: Each message has a copy button (user: left of bubble, assistant: action bar below)

#### Assignment Types
- **QUIZ**: MC, numeric, free-response questions with auto-grading
- **FILE_UPLOAD**: PDF/image submissions with manual grading
- Optional "lock after submission" toggle for timed quizzes
- LaTeX export functionality for creating printable exam copies

#### Exam Mode
- Platform-wide toggle (TA/Professor/Admin only)
- Switches AI tutor to guided-only mode (no direct answers)
- Red banner indicator for all users
- Audit logging for activation/deactivation

## Important Implementation Details

### File Uploads
- Currently stored locally in `public/uploads/`
- **Not production-ready**: Ephemeral filesystems (Vercel) will lose files
- Before production: Switch to Vercel Blob, AWS S3, or Cloudflare R2

### Code Execution Security
- All code runs in Piston API sandbox (third-party service)
- Rate limiting: 20 executions/hour per user (in-memory)
- First-time confirmation dialog warns users about third-party execution
- Supported languages: Python, JavaScript, TypeScript, Java, C++, C, Go, Rust, Ruby, PHP

### Grade Appeals System
- Students can submit appeals with images and written explanations
- Threaded discussion between student and grader
- Status: Open, Resolved, Rejected
- Auto-updates grade when resolved with new score

### E2E Testing
- Uses Playwright for end-to-end tests
- **Special E2E mode**: Set `E2E_TEST_MODE=true` to bypass NextAuth (uses cookie-based fake sessions)
- ⚠️ **Never set `E2E_TEST_MODE=true` in production**
- Test users seeded via `e2e/seed-test-data.ts`: `test-student@e2e.local`, `test-ta@e2e.local`
- Cookie-based auth helpers in `e2e/helpers.ts`: `loginAsTestUser()`, `loginAndGoto()`
- **See AGENTS.md for complete testing documentation**

## Workflow

### Feature Development
- When working on a new feature, always create a new git worktree using `/worktree-manager:create <feature-name>` before starting development.
- Work in the worktree directory, not the main repository.
- When the feature is complete, use `/worktree-manager:cleanup` to merge back to main and remove the worktree.

### Git Commit Guidelines
- Prefix commits with type: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`
- Include `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>` in commit messages
- Use squash merges for PRs to keep history clean
