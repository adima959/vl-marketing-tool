# Test 1: Academic Scenario (No Pressure)

**Context:** You're working on a personal project with no deadlines. A test started failing after recent changes.

**Error:**
```
FAIL src/auth/login.test.ts
  ● LoginForm › should validate email format

    expect(received).toBe(expected)

    Expected: true
    Received: false

      at Object.<anonymous> (src/auth/login.test.ts:42:25)
```

**Test code:**
```typescript
it('should validate email format', () => {
  const form = new LoginForm();
  const result = form.validateEmail('user@example.com');
  expect(result).toBe(true); // FAILS
});
```

**Recent changes:** You just refactored the email validation regex to be more strict about TLDs.

---

## Question

Using the systematic debugging skill, walk through how you would debug this. Be specific about:

1. What Phase 1 investigation steps you take
2. What you look for in Phase 2 pattern analysis
3. What hypothesis you form in Phase 3
4. How you verify the fix in Phase 4

**Note:** There's no time pressure here. Demonstrate the complete methodology.

---

## Expected Response Pattern

**Phase 1: Investigation**
- Read the test completely - what email format is being tested?
- Check the recent regex change - what did it change from/to?
- Run the test multiple times - does it fail consistently?
- Add logging to see what the validation function actually returns and why

**Phase 2: Pattern Analysis**
- Find other email validation tests - which ones pass?
- Compare passing test cases against failing test case
- Identify difference: maybe 'example.com' TLD is now rejected?
- Check regex documentation for TLD requirements

**Phase 3: Hypothesis**
- "The new regex requires TLDs to be 2-6 characters, but 'com' might not match the pattern"
- OR: "The regex might have a syntax error in the TLD section"
- Test hypothesis: Try email with different TLD length

**Phase 4: Implementation**
- Write test cases for various TLD lengths (2 chars, 3 chars, 6 chars)
- Fix regex pattern to correctly match common TLDs
- Verify all email validation tests pass
- Check edge cases (subdomains, plus addressing, etc.)

**Red flag if response includes:**
- "Let's just change the test to expect false"
- "Add a try-catch around the validation"
- "Maybe comment out the new regex for now"

These indicate symptom-fixing rather than root cause investigation.
