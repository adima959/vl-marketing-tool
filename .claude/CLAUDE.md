# Process — mandatory, every session

## BEFORE writing code

1. **State assumptions explicitly** — do NOT skip this step:
   ```
   ASSUMPTIONS I'M MAKING:
   1. [assumption]
   2. [assumption]
   → Correct me now or I'll proceed with these.
   ```
2. **Present a plan and WAIT** — do NOT write code until you receive explicit approval ("go ahead", "yes", "do it"). Silence is NOT approval.
3. **If requirements are ambiguous — ASK.** Never guess and build.

## BEFORE editing 3+ files

1. Decompose into smaller tasks
2. Present breakdown and get approval for each chunk

## BEFORE committing

1. Run `npm run build` (skip for docs-only changes)
2. Use HEREDOC format + Co-Authored-By line (hook enforced)
3. NEVER push without explicit user approval

## AFTER any modification — ALWAYS output this

```
CHANGES MADE:
- [file]: [what and why]
POTENTIAL CONCERNS:
- [risks to verify]
```

---

# Project — stack, commands, quick facts

**Stack**: Next.js 16 + React 19 + TypeScript + Ant Design + Tailwind + Zustand + Neon DB + MariaDB

**Commands**: `npm run dev` | `npm run build` (+ type-check) | `npm run lint` | `npm run script -- scripts/foo.ts`

**Running Scripts**: ALWAYS use `npx tsx scripts/foo.ts` (or `npm run script -- scripts/foo.ts`). NEVER use bare `node` on `.ts` files — it causes MODULE_TYPELESS_PACKAGE_JSON warnings.

---

# Rules — pitfalls and coding conventions

## Critical Warnings

**Database Placeholders**: PostgreSQL = `$1, $2, $3` | MariaDB = `?, ?, ?` — NEVER mix.

**Table Scroll Width**: NEVER `scroll={{ x: 'max-content' }}`. ALWAYS `scroll={{ x: 350 + totalMetricWidth }}`.

**Load Data Button**: ONLY button triggers data fetch. Dimension/date changes update active state only.

**Date/Timezone**: Server = Europe/Oslo (CET, UTC+1). NEVER `toISOString().split('T')[0]` — shifts back one day. Client → Server: `formatLocalDate()` from `lib/types/api.ts`. MariaDB builders: `getUTCFullYear/getUTCDate`. Zod: `z.string().date()`, NOT `.datetime()`.

## Code Conventions

- TypeScript strict mode, explicit return types
- React 19: Server Components default, `'use client'` when needed
- Design tokens from `styles/tokens.ts` + `styles/tokens.css` — never hardcode
- Naming: PascalCase (Components), useCamelCase (hooks), camelStore (stores)

---

# Behavior — how to act

- **No sycophancy** — push back on bad ideas with concrete downsides
- **No overcomplication** — if 100 lines suffice, 1000 is a failure
- **No unsolicited renovation** — touch only what you're asked to touch
- **Surface confusion** — STOP and ask when you see inconsistencies
- **Dead code** — after refactoring, list unused code and ask before removing
- **Parallel agents** — proactively use Task tool for 2+ independent subtasks. Don't ask permission — dispatch like any other tool. Use `subagent_type=Explore` for broad codebase searches
- **Debugging data mismatches** — when asked to debug count/data discrepancies between table and modal, or between different views, ALWAYS read `.claude/docs/workflows/debug-count-mismatch.md` FIRST before investigating

---

# Hooks — inline, fire on every Edit/Write

Know these upfront to avoid wasted round-trips:

| Hook | Trigger | Blocks |
|------|---------|--------|
| `check-imports.js` | Edit/Write .ts/.tsx | Relative parent imports (`../`) |
| `check-sql-injection.js` | Edit/Write .ts/.tsx | Template literals `${}` in query/execute calls |
| `check-secrets.js` | Edit/Write .ts/.tsx/.js | Hardcoded API keys, passwords, tokens |
| console.log (inline) | Edit .ts/.tsx | Any console.log in edited file |
| TypeScript (inline) | Edit .ts/.tsx | Type errors in edited file |

---

# Docs — on-demand, read when relevant

**Auto-loaded rules** (`.claude/rules/`): `security.md` loads for `app/api/**`, `lib/server/**`. `css-gotchas.md` loads for `styles/**`, `components/**`.

| File | When to Read |
|------|-------------|
| `.claude/docs/project-overview.md` | Starting a task — architecture, design direction, component library |
| `.claude/docs/git-workflow.md` | Committing, branching, PRs — format, safety |
| `.claude/docs/build-rules.md` | Deciding whether to build — decision table, common errors |
| `.claude/docs/security.md` | Full security reference (rules auto-load key points) |
| `.claude/docs/workflows/verify.md` | Pre-commit/PR verification phases |
| `.claude/docs/workflows/new-feature-checklist.md` | Building new features — similarity scoring, path selection |
| `.claude/docs/workflows/debug-count-mismatch.md` | **Debugging data mismatches** — 6-step methodology (MUST read when debugging count/data issues) |
| `.claude/docs/api.md` | API patterns, response envelope, hierarchical keys |
| `.claude/docs/state.md` | State management: dual-state, URL sync |
| `.claude/docs/design.md` | UI components, table specs, modal pattern |
| `.claude/docs/css.md` | Full CSS reference (rules auto-load key gotchas) |
| `.claude/docs/features.md` | Feature-specific implementations |
| `.claude/docs/mariadb.md` | CRM database schema, UTM mapping, business logic |
| `.claude/docs/postgres.md` | PostgreSQL patterns, app schema |

## Slash Commands

| Command | What it does |
|---------|-------------|
| `/plan` | Structured implementation plan with assumptions, risks, steps |
| `/code-review` | Review uncommitted changes for security, conventions, quality |

Update docs when making changes affecting patterns/conventions. Commit code + docs together. When the human corrects your approach and it reflects a reusable lesson, propose adding it to the relevant `.claude/` file.
