# Verification Workflow

> Run before commits and PRs. Follow all phases in order — stop and fix on failure.

## Phases

### 1. Build

```bash
npm run build
```

If fails → fix errors → re-run. Do not proceed.

### 2. Type Check (skip if build already includes it)

```bash
npx tsc --noEmit
```

Fix all type errors before continuing.

### 3. Lint

```bash
npm run lint
```

Fix lint errors. Warnings: fix if trivial, note if not.

### 4. Security Scan

```bash
# Hardcoded secrets
grep -rn "sk-\|api_key\|password.*=.*['\"]" --include="*.ts" --include="*.tsx" app/ lib/ 2>/dev/null | head -10

# console.log (should not be committed)
grep -rn "console.log" --include="*.ts" --include="*.tsx" app/ components/ lib/ 2>/dev/null | head -10
```

### 5. Diff Review

```bash
git diff --stat
git diff --name-only
```

Review each changed file for:
- Unintended changes
- Missing error handling
- Correct DB placeholder syntax (`$1` vs `?`)
- `@/` import paths (not relative)

## Report Format

```
VERIFICATION REPORT
===================

Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (X errors)
Lint:      [PASS/FAIL] (X warnings)
Security:  [PASS/FAIL] (X issues)
Diff:      [X files changed]

Overall:   [READY/NOT READY]

Issues to fix:
1. ...
```

## When to Run

| Trigger | Run? |
|---------|------|
| Before commit (code changes) | YES |
| Before creating PR | YES |
| After major refactor | YES |
| Documentation-only changes | NO |
| Mid-implementation checkpoint | Optional (build only) |
