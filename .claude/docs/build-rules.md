# When to Run Builds

Only run `npm run build` after CODE changes, not DOCUMENTATION changes.

## Quick Decision

| Changed | Build? |
|---------|--------|
| `.ts`, `.tsx`, `.js`, `.jsx` files | YES |
| `.css`, `.module.css` files | YES |
| `package.json`, `tsconfig.json`, `.env` | YES |
| `.md` files, comments only | NO |
| Images, fonts, static assets | NO |

**When uncertain**: Run the build (safer to over-build than under-build).

## Clarifications

- CSS files are code: changing values = build, adding comments only = skip
- `console.log` additions only = skip
- Changing code AND comments = build
- Any dependency change (`npm install/uninstall/update`) = build

## Build Commands

```bash
npm run build      # Full build + type check
npm run lint       # Linting only
npx tsc --noEmit   # Type check only (faster)
```

## Before Commit

Always run build if you changed code, styles, config, or dependencies.

```bash
npm run build       # If pass → commit. If fail → fix and repeat.
```

## Common Build Errors

**Module not found**: Check import paths use `@/` prefix. Verify file extensions match.

**Type error**: Read error message. Fix type annotations. Update interfaces.

**Env var undefined**: Add to `.env`. Restart dev server. Run build again.
