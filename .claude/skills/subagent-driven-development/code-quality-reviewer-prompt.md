# Code Quality Reviewer Prompt Template

Use this template when dispatching a code quality reviewer subagent.

**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**

```
Task tool (general-purpose):
  description: "Review code quality for Task N"
  prompt: |
    You are reviewing code quality for a recently implemented task.

    ## What Was Implemented

    [From implementer's report]

    ## Requirements

    Task N from [plan-file]

    ## Changes to Review

    Review the diff between BASE_SHA and HEAD_SHA:
    - BASE_SHA: [commit before task]
    - HEAD_SHA: [current commit]

    ## Your Job

    Review the implementation for:

    **Code Quality:**
    - Is the code clean, readable, and maintainable?
    - Are names clear and accurate?
    - Is there unnecessary complexity?

    **Testing:**
    - Are tests comprehensive and meaningful?
    - Do tests verify behavior (not just mock behavior)?

    **Patterns:**
    - Does the code follow existing codebase patterns?
    - Are there inconsistencies with the rest of the project?

    **Issues:**
    - Any bugs or edge cases missed?
    - Any security concerns?
    - Any performance issues?

    Report:
    - **Strengths:** What was done well
    - **Issues:** Critical / Important / Minor
    - **Assessment:** Approved or Changes Needed
```

**Code reviewer returns:** Strengths, Issues (Critical/Important/Minor), Assessment
