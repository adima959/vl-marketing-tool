# Project — stack, commands, quick facts

**Stack**: Next.js 16 + React 19 + TypeScript + Ant Design + Tailwind + Zustand + Neon DB + MariaDB

**Commands**: `npm run dev` | `npm run build` (+ type-check) | `npm run lint` | `npm run script -- scripts/foo.ts`

**Running Scripts**: ALWAYS use `npx tsx scripts/foo.ts` (or `npm run script -- scripts/foo.ts`). NEVER use bare `node` on `.ts` files — it causes MODULE_TYPELESS_PACKAGE_JSON warnings.

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

**Table Scroll Width**: NEVER `scroll={{ x: 'max-content' }}`. ALWAYS `scroll={{ x: attributeWidth + visibleMetricsWidth }}`.

**Load Data Button**: ONLY button triggers data fetch. Dimension/date changes update active state only.

**Date/Timezone**: Server = Europe/Oslo (CET, UTC+1). NEVER `toISOString().split('T')[0]` — shifts back one day. Client → Server: `formatLocalDate()` from `lib/types/api.ts`. MariaDB builders: `getUTCFullYear/getUTCDate`. Zod: `z.string().date()`, NOT `.datetime()`.

## Code Conventions

- TypeScript strict mode, explicit return types
- React 19: Server Components default, `'use client'` when needed
- Design tokens from `styles/tokens.ts` + `styles/tokens.css` — never hardcode
- Naming: PascalCase (Components), useCamelCase (hooks), camelStore (stores)

---

# Workflow — how to interact and code

## Process

1. **State assumptions explicitly** — do NOT skip this step:
   ```
   ASSUMPTIONS I'M MAKING:
   1. [assumption]
   2. [assumption]
   → Correct me now or I'll proceed with these.
   ```
2. **Present a plan and WAIT** — do NOT write code until you receive explicit approval ("go ahead", "yes", "do it"). Silence is NOT approval.
3. **If requirements are ambiguous — ASK.** Never guess and build.
4. **Before editing 3+ files** — decompose into smaller tasks and get approval for each chunk.
5. **After any modification** — ALWAYS output:
   ```
   CHANGES MADE:
   - [file]: [what and why]
   POTENTIAL CONCERNS:
   - [risks to verify]
   ```

## Behavior

- **Push back** — challenge bad ideas with concrete downsides. No sycophancy.
- **Surface confusion** — STOP and ask when you see inconsistencies or ambiguity.
- **Dead code** — after refactoring, list unused code and ask before removing.
- **Verify work** — run `npm run build` after code changes. Don't rely on the user to catch errors.
- **Debugging data mismatches** — trace the exact query on each side, find delta records, then root-cause.

## Sub-Agents

Use the Task tool proactively — dispatch like any other tool, don't ask permission.

| Pattern | When | Example |
|---------|------|---------|
| **Parallel** | 2+ independent tasks, no shared files | Explore auth system + explore DB schema simultaneously |
| **Sequential** | Task B needs output from Task A | Research existing patterns → then plan implementation |
| **Background** | Research not blocking current work | Investigate a module while implementing another |

**Agent types**:
- `Explore` — codebase search, reading files, understanding patterns (use for broad searches)
- `Plan` — design implementation approach, weigh alternatives
- `Bash` — run commands, git operations, build scripts
- `general-purpose` — complex multi-step tasks combining search + analysis

**Provide explicit context**: file paths, what to look for, expected output. Vague dispatches fail.

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

Update docs when making changes affecting patterns/conventions. Commit code + docs together. When the human corrects your approach and it reflects a reusable lesson, propose adding it to the relevant `.claude/` file.
