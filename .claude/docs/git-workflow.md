# Git Workflow Rules

> See CLAUDE.md "Critical Warnings" for the git push rule. This file covers operational details.

## When to Commit

**Automatic when 2+ criteria met**:
- Build/tests pass (if code changed)
- 3+ files changed OR significant feature complete
- Can describe in one clear sentence
- TodoWrite item(s) complete
- Reviewable as standalone unit

**DO commit**: Feature complete, bug fixed, before switching tasks, natural breakpoints
**DON'T commit**: Single typos, mid-implementation, quick experiments (batch these)

## When to Push

- NEVER auto-push, NEVER push without asking — even after multiple commits
- ALWAYS ask before EVERY push. Each session = new permission needed
- "Commit" = local only, NEVER includes push

**Ask Pattern**:
```
"I've committed [description]. There are [N] unpushed commits.
Would you like me to push them to remote now?"
```

## Commit Messages

**Format**:
```bash
<type>: <description>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**Types**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

**Use HEREDOC**:
```bash
git commit -m "$(cat <<'EOF'
feat: Add GenericDataTable

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

## Pull Requests

**When**: Feature complete + tests pass + user requests
**Never**: From main, with uncommitted changes, before approval, mid-development

```bash
git branch              # Verify not on main
git commit -m "..."
git push -u origin feature-branch
gh pr create --title "..." --body "..."
```

## Git Safety

**NEVER**:
- Update git config without permission
- Run destructive commands unless explicitly requested: `--force`, `--hard`, `checkout .`, `restore .`, `clean -f`, `branch -D`
- Skip hooks (`--no-verify`, `--no-gpg-sign`)
- Force push to main/master
- Commit secrets (`.env`, credentials, `*.key`, `*.pem`)
- Use interactive flags (`-i`)
- Use `--amend` after hook failure (creates NEW commit instead)

**Staging**: Prefer specific files over `git add .` to avoid accidentally staging secrets

## Common Commands

```bash
git status              # Check status (NEVER -uall)
git diff                # Unstaged changes
git diff --cached       # Staged changes
git log --oneline -10   # Recent commits
git stash / git stash pop
git reset --soft HEAD~1 # Undo commit, keep staged
git checkout -b feature # New branch
```

## Hook Failures

If pre-commit hook fails:
1. Read error message
2. Fix issues (lint, format, tests)
3. Re-stage files
4. Create NEW commit (NOT --amend)

```bash
npm run lint:fix
git add .
git commit -m "fix: Address lint errors"  # NEW commit
```

## View PR Comments

```bash
gh api repos/owner/repo/pulls/123/comments
```
