---
description: Review uncommitted changes for security issues, code quality, and project convention violations.
allowed-tools: Bash, Read, Grep, Glob
---

Review all uncommitted changes against project standards.

## Steps

1. Get changed files: `git diff --name-only HEAD`
2. Read each changed file
3. Check against the rules below
4. Generate report

## What to Check

**Security (CRITICAL)** — block commit if found:
- Hardcoded secrets (API keys, passwords, tokens)
- SQL without parameterized queries (PostgreSQL: `$1`, MariaDB: `?`)
- User input used directly in queries without validation
- Stack traces or internal details in API error responses
- Sensitive data in `console.log`

**Project Conventions (HIGH):**
- Relative imports instead of `@/` paths (except same directory)
- Hardcoded colors/spacing instead of design tokens
- `scroll={{ x: 'max-content' }}` on Ant Design tables
- Missing `{ success, data }` response envelope in API routes
- Mixed database placeholder syntax

**Code Quality (MEDIUM):**
- `console.log` statements (should not be committed)
- Functions > 50 lines
- Dead code or unused imports
- Missing error handling in API routes

## Report Format

```
CODE REVIEW
===========

[CRITICAL] file.ts:42 — SQL string concatenation (use $1 params)
[HIGH] component.tsx:15 — Relative import (use @/ path)
[MEDIUM] api/route.ts:30 — console.log left in code

Summary: X critical, Y high, Z medium
Verdict: [BLOCK/PASS] — [reason]
```

Rules:
- CRITICAL issues = block commit, must fix
- HIGH issues = should fix before commit
- MEDIUM issues = note for author, can proceed
- Only review changed lines, not entire files
- Reference specific line numbers
