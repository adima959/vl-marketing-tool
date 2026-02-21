# Project — stack, commands, quick facts

**Stack**: Next.js 16 + React 19 + TypeScript + Ant Design + Tailwind + Zustand + Neon DB + MariaDB

**Commands**: `npm run dev` | `npm run build` (+ type-check) | `npm run lint` | `npm run script -- scripts/foo.ts`

**Running Scripts**: ALWAYS use `npx tsx scripts/foo.ts` (or `npm run script -- scripts/foo.ts`). NEVER use bare `node` on `.ts` files — it causes MODULE_TYPELESS_PACKAGE_JSON warnings.

**Verification**: `npm run build` (TypeScript + Next.js compilation). No test suite — verify via build output.

**Architecture**:
```
app/          - Next.js routes, API endpoints
components/   - table/ (GenericDataTable), filters/, modals/, ui/, marketing-pipeline/
hooks/        - URL sync hooks per feature area (useGenericUrlSync, useUrlSync, etc.)
stores/       - Zustand stores per feature area (dashboardStore, reportStore, sessionStore, etc.)
types/        - report.ts, table.ts, dimensions.ts, metrics.ts, sales.ts, marketing-pipeline.ts
lib/          - server/ (crmQueryBuilder, marketingQueryBuilder, trackerQueryBuilder), utils/, formatters
```

---

# Rules — pitfalls and coding conventions

## Critical Warnings

**Database Placeholders**: PostgreSQL = `$1, $2, $3` | MariaDB = `?, ?, ?` — NEVER mix.

**MariaDB Queries**: Use `pool.execute()` for parameterized queries, `pool.query()` for simple — avoids "prepared statement needs to be re-prepared" errors with views.

**Table Scroll Width**: NEVER `scroll={{ x: 'max-content' }}`. ALWAYS `scroll={{ x: attributeWidth + visibleMetricsWidth }}`.

**Load Data Button**: ONLY button triggers data fetch. Stores use dual-state: `dateRange` (active/editing) vs `loadedDateRange` (rendered). Dimension/date changes update active state only. New stores MUST follow this pattern — see `stores/reportStore.ts`.

**Date/Timezone**: Server = Europe/Oslo (CET, UTC+1). NEVER `toISOString().split('T')[0]` — shifts back one day. Client → Server: `formatLocalDate()` from `lib/types/api.ts`. MariaDB builders: `getUTCFullYear/getUTCDate`. Zod: `z.string().date()`, NOT `.datetime()`.

**API Route Auth**: All routes use `withAuth()` (basic), `withRole('admin')` (admin-only), or `withPermission('feature', 'action')` (RBAC). Never skip auth wrappers. Pattern: `export const POST = withAuth(async (req, user) => { ... })`.

## Code Conventions

- TypeScript strict mode, explicit return types
- React 19: Server Components default, `'use client'` when needed
- Design tokens from `styles/tokens.ts` + `styles/tokens.css` — never hardcode
- Naming: PascalCase (Components), useCamelCase (hooks), camelStore (stores)
- Imports: Use `@/` path alias (e.g., `@/lib/server/db`). NEVER `../` — blocked by hook
- API routes: `withAuth` wrapper → Zod parse body → business logic → `NextResponse.json({ success: true, data })`. Errors: `handleApiError(error)` from `lib/server/apiErrorHandler.ts`

---

# Workflow — how to interact and code

## Process

1. **Simple tasks** (1-2 files, clear scope) — just do it. No ceremony needed.
2. **Medium tasks** (3+ files) — state assumptions, get approval before coding.
3. **Complex features** — present a full plan and WAIT for explicit approval ("go ahead", "yes", "do it"). Silence is NOT approval.
4. **If requirements are ambiguous — ASK.** Never guess and build.

## Behavior

- **Push back** — challenge bad ideas with concrete downsides. No sycophancy.
- **Surface confusion** — STOP and ask when you see inconsistencies or ambiguity.
- **Dead code** — after refactoring, list unused code and ask before removing.
- **Verify work** — run `npm run build` after code changes. Don't rely on the user to catch errors.
- **Debugging data mismatches** — trace the exact query on each side, find delta records, then root-cause.

Use the Task tool proactively — dispatch like any other tool, don't ask permission.

---

# Hooks — inline, fire on every Edit/Write

Know these upfront to avoid wasted round-trips:

| Hook | Trigger | Blocks |
|------|---------|--------|
| `post-edit-checks.js` | Edit/Write .ts/.tsx/.js | Relative parent imports (`../`), SQL injection (`${}` in queries), hardcoded secrets |

---

# Docs — on-demand, read when relevant

**Auto-loaded rules** (`.claude/rules/`): `css-gotchas.md` loads for `styles/**`, `components/**`.

| File | When to Read |
|------|-------------|
| `.claude/docs/frontend.md` | Design direction, CSS strategy, component patterns, table specs, gotchas |
| `.claude/docs/api.md` | API patterns, response envelope, hierarchical keys |
| `.claude/docs/git-workflow.md` | Build decisions, pre-commit verification, committing, branching, PRs |
| `.claude/docs/database.md` | CRM schema, business rules, UTM mapping, PostgreSQL app notes |
| `.claude/docs/codebase-index.md` | Full codebase index — routes, APIs, components, stores, hooks, lib, types |
| `.claude/docs/crm-data-matching.md` | CRM number validation, trial counting methodology, reference values |

Update docs when making changes affecting patterns/conventions. Commit code + docs together. When the human corrects your approach and it reflects a reusable lesson, propose adding it to the relevant `.claude/` file.

---

# Context Management

**On compaction**: Preserve the full list of modified files, active task context, and any database query patterns discussed.
