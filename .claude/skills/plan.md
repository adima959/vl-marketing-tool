---
description: Create a structured implementation plan. Analyzes requirements, surfaces risks, decomposes into steps, and waits for approval before writing code.
argument-hint: [feature description]
allowed-tools: Read, Glob, Grep
---

Restate the user's request in concrete terms. Then follow these steps:

1. **Search for similar** — Check existing components/patterns per `docs/workflows/new-feature-checklist.md`
2. **Surface assumptions** — List every assumption explicitly
3. **Identify risks** — What could go wrong, what's unclear
4. **Decompose into steps** — Break into ordered tasks with file targets

Output using this format:

```
REQUIREMENTS:
[Restate what's being built in concrete terms]

ASSUMPTIONS I'M MAKING:
1. [assumption]
2. [assumption]

SIMILAR PATTERNS FOUND:
- [component/file] — [relevance]

PLAN:
1. [step] — [why] — [files touched]
2. [step] — [why] — [files touched]
3. [step] — [why] — [files touched]

RISKS:
- [risk] — [mitigation]

→ Waiting for your go-ahead.
```

Rules:
- Do NOT write any code until explicit approval
- If requirements are ambiguous, ask clarifying questions FIRST
- If touching 3+ files, each step should be reviewable independently
- Reference existing patterns from `docs/` when relevant
- Include verification step (build + type check) as final step
