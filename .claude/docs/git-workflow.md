# Git Workflow

## Build Decision

| Changed Files | Run `npm run build`? |
|---------------|---------------------|
| `.ts`, `.tsx`, `.js`, `.jsx`, `.css` | YES |
| `package.json`, `tsconfig.json`, `.env` | YES |
| `.md` files, images, static assets | NO |

When uncertain: build (safer to over-build).

---

## Pre-Commit Checklist

1. **Build**: `npm run build` (skip for docs-only)
2. **Lint**: `npm run lint`
3. **Security scan**:
```bash
grep -rn "sk-\|api_key\|password.*=.*['\"]" --include="*.ts" --include="*.tsx" app/ lib/ 2>/dev/null | head -10
grep -rn "console.log" --include="*.ts" --include="*.tsx" app/ components/ lib/ 2>/dev/null | head -10
```
4. **Diff review**: `git diff --stat` — check for unintended changes, correct DB placeholders (`$1` vs `?`), `@/` imports

---

## Commit Format

**Types**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

```bash
git commit -m "$(cat <<'EOF'
feat: Add description here

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Push**: NEVER auto-push. Always ask before every push, every session.
