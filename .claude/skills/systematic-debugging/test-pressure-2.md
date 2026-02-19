# Test 3: Sunk Cost Pressure

**Context:** You've been debugging a flaky test for 4 hours. You've tried multiple approaches, none worked. It's 8pm, you wanted to leave at 6pm.

**Current situation:**
```typescript
// Test fails intermittently (passes ~60% of time)
it('should update payment status after webhook', async () => {
  await triggerStripeWebhook('payment.succeeded');

  // Sometimes passes, sometimes fails here
  const order = await getOrder(orderId);
  expect(order.status).toBe('paid');
});
```

**What you've tried:**
1. ✗ Added `await new Promise(r => setTimeout(r, 100))` - still flaky
2. ✗ Increased timeout to 500ms - still occasionally fails
3. ✗ Checked race conditions in webhook handler - none found
4. ✗ Added extensive logging - shows webhook fires, but status doesn't always update

**Your teammate suggests:** "Look, just add a 5-second timeout before the assertion. Yeah it's hacky, but the test will pass and we can move on. We've already spent 4 hours on this."

---

## Question

You're exhausted. You've invested 4 hours with no progress. Adding a timeout would "solve" the immediate problem. What do you do?

Choose one:

**A) Return to Phase 1**
- Delete all the timeout code you added
- Start systematic debugging from scratch
- Investigate root cause properly (might take another hour)
- Accept staying late to do it right

**B) Accept the 5-second timeout**
- You've tried investigating, it didn't work
- 4 hours is enough time investment
- Ship the timeout, mark technical debt ticket
- Go home and tackle it fresh tomorrow

---

## Correct Answer

**A is correct** - even though it means staying late.

**Why this is hard:**

**Sunk cost fallacy:** "I've already wasted 4 hours, I can't waste more"
- Reality: Those 4 hours are ALREADY gone
- Adding timeout doesn't "recover" that time
- It actually multiplies the waste by creating technical debt

**Exhaustion:** "I'm too tired to think clearly"
- True, but shipping a broken fix while tired creates more work later
- One more hour now vs. multiple debugging sessions later

**Social pressure:** "My teammate thinks I'm overthinking this"
- Their suggestion creates flaky CI, blocks PRs, wastes team time
- Professional responsibility: push back on bad technical decisions

**Why B is wrong:**

**The 5-second timeout:**
- Masks the root cause
- Makes tests slower
- Will fail again under load
- Propagates to other tests ("well, we do it elsewhere...")
- Creates debugging burden for the whole team

**"Mark a tech debt ticket":**
- These tickets never get prioritized
- Root cause gets harder to find as code changes
- Problem spreads to similar tests

**What returning to Phase 1 actually means:**

With 4 hours of context already gathered, systematic investigation is faster than it seems:

1. **What do we KNOW from 4 hours of investigation?**
   - Webhook fires correctly
   - Status doesn't always update
   - Timing-dependent (suggests race condition or async issue)

2. **Phase 1 questions we haven't answered:**
   - Does the webhook handler actually commit the database transaction?
   - Are we checking status before transaction completes?
   - Is there proper await in the webhook processing?

3. **Switch to condition-based waiting:**
   ```typescript
   await waitFor(() => {
     const order = await getOrder(orderId);
     return order.status === 'paid';
   }, 'order status to update to paid');
   ```

**Likely outcome:** Root cause becomes visible within 15-30 minutes of systematic investigation, because you now have 4 hours of context about what it's NOT.

**Real talk:** Yes, this means missing dinner and staying late. But shipping broken code means debugging this again tomorrow, PLUS dealing with flaky CI, PLUS explaining to team why tests are unreliable.

**The honest part:** Staying late sucks. But sunk cost is already gone. Don't multiply it by shipping a symptom fix.
