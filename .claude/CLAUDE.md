# MANDATORY GATES

Non-negotiable. EVERY session. NO exceptions.

## BEFORE writing any code

1. State assumptions:
   ```
   ASSUMPTIONS I'M MAKING:
   1. [assumption]
   2. [assumption]
   → Correct me now or I'll proceed with these.
   ```
2. Present a plan and WAIT for explicit "go ahead" — do NOT auto-proceed
3. If requirements are ambiguous, ask — never guess and build

## BEFORE committing

1. Run `npm run build` (skip for docs-only changes)
2. Use HEREDOC format + Co-Authored-By line (hook enforced)
3. NEVER push without explicit user approval (hook warns)

## BEFORE editing 3+ files

1. Decompose into smaller tasks
2. Present breakdown and get approval for each chunk

## AFTER any modification

```
CHANGES MADE:
- [file]: [what and why]
POTENTIAL CONCERNS:
- [risks to verify]
```

---

**Stack**: Next.js 16 + React 19 + TypeScript + Ant Design + Tailwind + Zustand + Neon DB + MariaDB

**Commands**: `npm run dev` | `npm run build` (+ type-check) | `npm run lint`

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

## Behavioral Rules

- **No sycophancy** — push back on bad ideas with concrete downsides
- **No overcomplication** — if 100 lines suffice, 1000 is a failure
- **No unsolicited renovation** — touch only what you're asked to touch
- **Surface confusion** — STOP and ask when you see inconsistencies
- **Dead code** — after refactoring, list unused code and ask before removing
- **Parallel agents** — proactively use Task tool for 2+ independent subtasks. Don't ask permission — dispatch like any other tool. Use `subagent_type=Explore` for broad codebase searches

---

# Hooks (mechanical enforcement)

These run automatically. You cannot bypass them.

| Hook | Trigger | Blocks |
|------|---------|--------|
| `validate-commit.js` | `git commit` | Missing HEREDOC, Co-Authored-By, or type prefix |
| `block-push.js` | `git push` | Warning only — shows diff stats, reminds to get approval |
| `block-dangerous-git.js` | `git *` | `--force`, `--hard`, `checkout .`, `restore .`, `clean -f`, `--no-verify`, `branch -D` |
| `check-imports.js` | Edit/Write .ts/.tsx | Relative parent imports (`../`) |
| `check-sql-injection.js` | Edit/Write .ts/.tsx | Template literals `${}` in query/execute calls |
| `check-secrets.js` | Edit/Write .ts/.tsx/.js | Hardcoded API keys, passwords, tokens |
| console.log (inline) | Edit .ts/.tsx | Any console.log in edited file |
| TypeScript (inline) | Edit .ts/.tsx | Type errors in edited file |

---

# Documentation (all on-demand — read when relevant)

| File | When to Read |
|------|-------------|
| `docs/project-overview.md` | Starting a task — architecture, design direction, component library, decision tree |
| `docs/git-workflow.md` | Committing, branching, PRs — format, safety, hook failures |
| `docs/build-rules.md` | Deciding whether to build — decision table, common errors |
| `docs/security.md` | Writing API routes or DB queries — validation patterns |
| `docs/workflows/verify.md` | Pre-commit/PR verification phases |
| `docs/workflows/new-feature-checklist.md` | Building new features — similarity scoring, path selection |
| `docs/components/generic-table.md` | Building a hierarchical data table |
| `docs/components/url-sync.md` | Adding URL-synced state |
| `docs/components/store-pattern.md` | Creating a Zustand store |
| `docs/workflows/new-dashboard.md` | Creating a new dashboard (7-8 files) |
| `docs/workflows/add-metric.md` | Adding a metric column |
| `docs/workflows/add-dimension.md` | Adding a dimension |
| `docs/workflows/standalone-component.md` | Building a custom component |
| `docs/api.md` | API patterns, query builders |
| `docs/state.md` | State management: dual-state, URL sync |
| `docs/design.md` | UI components, layouts |
| `docs/css.md` | Styling, tokens, Ant Design overrides, known gotchas |
| `docs/features.md` | Feature-specific implementations |
| `docs/mariadb.md` | CRM database (MariaDB) |
| `docs/postgres.md` | PostgreSQL patterns, app schema |

## Slash Commands

| Command | What it does |
|---------|-------------|
| `/plan` | Structured implementation plan with assumptions, risks, steps |
| `/code-review` | Review uncommitted changes for security, conventions, quality |

Update docs when making changes affecting patterns/conventions. Commit code + docs together. When the human corrects your approach and it reflects a reusable lesson, propose adding it to the relevant `.claude/` file.
