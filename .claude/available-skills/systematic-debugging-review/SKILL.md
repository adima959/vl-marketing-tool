# Systematic Debugging

**When to use:** When encountering any bug, test failure, or unexpected behavior in your code. This skill provides a methodology to find root causes systematically rather than guessing at fixes.

**Core principle:** NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.

---

## The 4-Phase Systematic Process

### Phase 1: Root Cause Investigation

**STOP. Read the error message completely.**

Before ANY hypothesis:

1. **Read error messages carefully**
   - Full stack trace
   - Actual vs expected values
   - Which test/code path triggers it

2. **Reproduce consistently**
   - Run test multiple times
   - Isolate to single test if possible
   - Note any timing dependencies

3. **Check recent changes**
   - What code changed in last commit?
   - New dependencies added?
   - Configuration changes?

4. **Gather diagnostic evidence**
   - Add logging at component boundaries
   - Capture state before/after failure point
   - Use debugger to inspect live state

5. **Trace data flow backwards**
   - Where does invalid data come from?
   - What calls this function?
   - What values are passed?

**DO NOT proceed to Phase 2 until you understand the failure mechanism.**

---

### Phase 2: Pattern Analysis

1. **Locate working examples**
   - Find similar code that works correctly
   - Identify reference implementations

2. **Compare against references COMPLETELY**
   - Line by line comparison
   - Look for missing setup steps
   - Check for environment differences

3. **Identify ALL differences**
   - Don't stop at first difference
   - List every variation
   - Consider interaction effects

4. **Understand dependencies**
   - What does this code rely on?
   - Are dependencies properly initialized?
   - Version mismatches?

---

### Phase 3: Hypothesis and Testing

1. **Form ONE specific hypothesis about root cause**
   - State clearly: "I believe X causes Y because Z"
   - Must explain ALL observed symptoms
   - Based on evidence from Phase 1 & 2

2. **Test hypothesis with minimal change**
   - Change only one thing
   - Predict outcome before testing
   - Document actual outcome

3. **Verify the fix**
   - Does it fix THIS case?
   - Does it break other cases?
   - Does it explain why it was broken?

4. **If hypothesis fails: return to Phase 1**
   - Don't stack another guess on top
   - Re-examine evidence with new information
   - Ask for help if uncertain

---

### Phase 4: Implementation

1. **Write failing test case first**
   - Demonstrates the bug
   - Will verify the fix
   - Prevents regression

2. **Implement single fix addressing root cause**
   - Not multiple simultaneous changes
   - Not symptom treatment
   - Traceable to root cause

3. **Verify fix works**
   - Failing test now passes
   - All other tests still pass
   - Edge cases covered

4. **Question architecture if 3+ attempts fail**
   - Stop attempting fixes
   - Is the design fundamentally flawed?
   - Should this work differently?

---

## Red Flags - Return to Phase 1 if you think:

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Maybe if I add a timeout..."
- "It works on my machine"
- "Let's wrap it in try/catch for now"

These indicate you're guessing, not debugging systematically.

---

## Critical Constraints

**ALWAYS find root cause, NEVER fix symptoms** - even if I seem in a hurry

**When 3+ fix attempts fail** - STOP. Question the architecture, don't keep guessing.

**Every fix must trace to root cause** - If you can't explain why it was broken, you haven't fixed it.

**No stacking guesses** - If hypothesis fails, return to Phase 1 with new information.

---

## Key Principles from Sub-Modules

### Root Cause Tracing
When bugs appear deep in the call stack, trace backwards through the call chain until you find the original trigger. Fix at the source, not where the error manifests. See `root-cause-tracing.md` for detailed methodology.

### Condition-Based Waiting
Replace arbitrary timeouts with waiting for actual conditions. Tests with `setTimeout(check, 50)` are guessing at timing. Instead wait for the state you actually need: `waitFor(() => condition())`. See `condition-based-waiting.md` for implementation patterns.

### Defense-in-Depth
After finding root cause, add validation at multiple layers to make the bug impossible. Entry point validation + business logic + environment guards + debug instrumentation. See `defense-in-depth.md` for layering strategy.

---

## Effectiveness Data

From real debugging sessions applying this methodology:

- **Time investment:** 15-30 minutes systematic debugging vs 2-3 hours random fixes
- **First-time fix rate:** 95% vs 40% for ad-hoc debugging
- **Test stability:** Fixed 15 flaky tests, 60% → 100% pass rate
- **Prevention:** 4-layer defense makes entire bug classes impossible

---

## Testing This Skill

This directory includes pressure tests to verify you'll follow this methodology even when:
- Under time pressure
- Facing apparently simple bugs
- Dealing with social pressure to skip investigation
- After sunk cost from failed approaches

See: `test-academic.md`, `test-pressure-1.md`, `test-pressure-2.md`, `test-pressure-3.md`

---

## Tools in This Directory

- `condition-based-waiting-example.ts` - Complete implementation of waitFor utilities
- `find-polluter.sh` - Binary search script to identify which test creates unwanted files/state

---

## Summary

**Before fixing:** Complete Phase 1 investigation
**While fixing:** One hypothesis at a time, test completely
**After fixing:** Add defensive layers to prevent recurrence
**If stuck:** After 3 failed attempts, question the architecture

Systematic debugging takes 15-30 minutes and fixes the problem. Random debugging takes 2-3 hours and creates technical debt.
