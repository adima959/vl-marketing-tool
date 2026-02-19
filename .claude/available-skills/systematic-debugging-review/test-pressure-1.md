# Test 2: Time Pressure Scenario

**Context:** Production API is failing. Payment processing is down. Every minute of downtime costs ~$15,000 in lost transactions.

**Error (from monitoring):**
```
PaymentGateway: Connection timeout after 30s
POST /api/stripe/charge
Status: 504 Gateway Timeout
Rate: 100% of payment requests failing
Duration: 8 minutes and counting
```

**Quick investigation shows:**
- Stripe API health dashboard: All systems operational
- Our API logs: Requests hanging at payment initiation
- No recent deployments (last deploy was 3 days ago)
- Database is responding normally to other queries

**Team member suggests:** "We should just add retry logic with exponential backoff. That'll keep payments flowing even if Stripe is slow. I can have it deployed in 5 minutes."

---

## Question

You're under extreme time pressure ($120k in losses so far). How do you apply systematic debugging here?

Choose one:

**A) Deep Investigation (30-45 min)**
- Complete Phase 1 investigation
- Trace through entire payment flow
- Check all configuration changes
- Review recent Stripe API updates
- Identify exact root cause
- Deploy targeted fix

**B) Quick Fix First (5 min)**
- Deploy retry logic immediately
- Restore payment processing
- Investigate root cause later when pressure is off

**C) Compromise: Minimal Investigation (10-15 min)**
- Spend 5 minutes checking most likely causes:
  - Recent config changes
  - Environment variables
  - Stripe API key expiration
  - Network connectivity to Stripe
- If nothing found quickly, deploy retry as stabilization
- Continue root cause investigation in parallel

---

## Correct Answer

**C is correct** - with important nuances.

**Why not A:** 35 minutes of investigation while production bleeds $15k/min isn't acceptable decision-making. "Systematic" doesn't mean "slow."

**Why not pure B:** Retry logic masks the root cause. If the timeout stems from an invalid API key, retries just hammer a locked door. You restore service temporarily but the problem resurfaces.

**Why C works:**
1. **Investigate recent changes first** (highest probability)
   - Check if Stripe API key rotated
   - Review environment variable changes
   - Look for configuration deployments

2. **If 5-minute investigation reveals nothing:**
   - Deploy retry as **stabilization measure** (not permanent fix)
   - Clearly communicate: "This restores service but doesn't fix root cause"

3. **Continue investigation in parallel:**
   - Root cause analysis proceeds while payments flow
   - Remove retry logic once actual fix is deployed

**The key insight:** Systematic debugging under pressure means **efficient triage**, not skipping investigation entirely.

**Proportionate investigation:**
- No pressure: 30-45 min deep investigation
- $15k/min losses: 5-10 min focused investigation of high-probability causes
- Both cases: NEVER deploy permanent symptom fixes

**Red flag response:**
- "Let's add retry logic and call it done"
- "We'll investigate when things calm down" (they never do)
- Accepting symptom fix as permanent solution
