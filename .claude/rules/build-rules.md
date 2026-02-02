# When to Run Builds

## Core Rule

**Only run `npm run build` after CODE changes, not DOCUMENTATION changes**

---

## Quick Decision

| Changed | Build? |
|---------|--------|
| `.ts`, `.tsx`, `.js`, `.jsx` files | ✅ YES |
| `.css`, `.module.css` files | ✅ YES |
| `package.json`, `tsconfig.json`, `.env` | ✅ YES |
| `.md` files, comments only | ❌ NO |
| Images, fonts, static assets | ❌ NO |

---

## Build If You Changed

✅ Added/removed/renamed any code file
✅ Changed function signature (params, return type)
✅ Modified imports/exports
✅ Changed dependencies in `package.json`
✅ Modified `tsconfig.json` or `next.config.js`
✅ Changed CSS file content (not just comments)
✅ Modified environment variables

---

## Skip Build If ONLY

❌ Markdown files
❌ Code comments (`//` or `/* */`)
❌ Console.log statements
❌ README or documentation
❌ Git files (`.gitignore`)
❌ CSS comments only (no value changes)

---

## Decision Tree

```
Changed code/CSS/config? → YES → Run build
Changed docs/comments only? → YES → Skip build
Uncertain? → Run build (safer)
```

---

## Important Clarifications

**CSS files are CODE**:
- ✅ Changing CSS values → Run build
- ❌ Adding CSS comments only → Skip build
- ✅ Changing tokens in `tokens.css` → Run build

**Comments**:
- ❌ Only adding/changing comments → Skip build
- ✅ Changing code AND comments → Run build

**Dependencies**:
```bash
npm install package-name    # → Run build
npm uninstall package-name  # → Run build
npm update                  # → Run build
```

---

## Build Commands

```bash
npm run build      # Full build + type check
npm run lint       # Linting only
npx tsc --noEmit   # Type check only (faster)
```

---

## When Uncertain

**Rule of thumb**: Run the build (safer to over-build than under-build)

**Cost**: 30-60 seconds
**Benefit**: Catches errors before commit

---

## Before Commit

Always run build if you:
1. Changed code files
2. Modified styles
3. Updated configuration
4. Added/removed dependencies
5. Are uncertain

**Workflow**:
```bash
# 1. Make changes
# 2. Run build
npm run build

# 3. If pass, commit
git commit -m "..."

# 4. If fail, fix and repeat
```

---

## Common Build Errors

**Module not found**:
- Check import paths use `@/` prefix
- Verify file extensions match

**Type error**:
- Read error message
- Fix type annotations
- Update interfaces

**Env var undefined**:
- Add to `.env`
- Restart dev server
- Run build again

---

## Summary

| Scenario | Build? | Why |
|----------|--------|-----|
| Changed `.tsx` | ✅ YES | Code |
| Changed `.css` | ✅ YES | Styles |
| Added CSS comment | ❌ NO | Comment |
| Changed `.md` | ❌ NO | Docs |
| Updated `package.json` | ✅ YES | Config |
| Added code comment | ❌ NO | Comment |
| Renamed file | ✅ YES | Structure |
| Added `console.log` | ❌ NO | Debug |
| Changed token | ✅ YES | Compilation |
| Updated `.gitignore` | ❌ NO | Git only |

**When in doubt**: Run the build.
