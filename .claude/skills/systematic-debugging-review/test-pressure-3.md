# Test 4: Social Pressure Scenario

**Context:** You're a junior developer. A senior engineer on your team has asked you to implement a feature. You've run into a bug.

**The situation:**

Your auth middleware invalidates tokens after certain operations. Users report being logged out unexpectedly.

**Senior engineer's suggestion:** "Oh yeah, we've seen this before. Just add a token refresh in the middleware. Whenever a token is about to expire, auto-refresh it. Here's a code snippet from another project that does it."

They share a 50-line code block with complex token refresh logic.

**Your systematic debugging skill says:** "Don't claim to implement pattern without reading it completely. Understand why tokens are invalidating before adding refresh logic."

**But you're thinking:**
- They're senior, they've been here 5 years
- They've solved this before
- Pushing back might seem like you don't trust their experience
- It's been offered as a ready solution
- You don't want to seem difficult or overly cautious

---

## Question

The senior engineer is waiting for your response. They've offered a solution. Do you:

**A) Push back and investigate root cause**
- "I want to understand why tokens are invalidating before adding refresh logic"
- Risk seeming difficult or like you don't trust their expertise
- Might take 30-45 minutes to trace through auth flow

**B) Implement their suggested solution**
- They're senior, they probably know best
- It's a known pattern from another project
- Gets the feature unblocked quickly
- You can ask questions while implementing

---

## Correct Answer

**A is correct** - and here's how to do it without damaging the relationship.

**Why this matters:**

Your systematic debugging skill explicitly states: "Don't claim to implement pattern without reading it completely."

The senior engineer is proposing a **symptom fix**, not a **root cause solution**:
- Token invalidation after middleware → suggests middleware logic error
- Refreshing tokens → masks the underlying problem
- Copying pattern from other project → might not fit this context
- Ready solution → bypasses investigation entirely

**Why this is professionally important:**

**Technical:**
- Auto-refresh might mask a security issue
- Could create new race conditions
- Might not actually solve the user-reported problem
- Creates technical debt that compounds

**Career:**
- Blindly implementing without understanding teaches bad habits
- Senior engineers respect juniors who think critically
- A good senior WANTS you to ask questions
- A bad senior who punishes questions is a red flag about workplace culture

**How to execute Option A effectively:**

**Frame it as collaborative learning, not doubting their expertise:**

*"I respect your experience with this pattern. Before we implement, I want to understand the token lifecycle in our middleware—not to second-guess you, but so I can debug similar issues myself in the future. Can we spend 15 minutes mapping out what's happening?"*

**This approach:**
- Acknowledges their seniority ("respect your experience")
- Frames as learning opportunity ("so I can debug similar issues")
- Makes it collaborative ("can we spend 15 minutes")
- Doesn't directly challenge their solution
- Demonstrates professional growth mindset

**If they push back:**

*"I understand the pattern works elsewhere. I'm concerned we might be masking a security issue or race condition. Could we at least add logging to understand which operations trigger invalidation?"*

**This approach:**
- Shows you're thinking about production implications
- Suggests minimal investigation (logging)
- Demonstrates you're protecting the codebase, not being difficult

**Likely outcomes:**

**Best case:** Senior engineer says "Good point, let's investigate together" and you:
- Build relationship through collaborative debugging
- Learn from their experience
- Find the actual root cause faster with two sets of eyes
- Document the fix properly

**Medium case:** They insist on their solution, but you've:
- Demonstrated critical thinking
- Protected yourself if solution causes problems later
- Learned who gives thoughtful vs. reflexive guidance

**Worst case:** They're annoyed you questioned them
- This is valuable information about workplace culture
- A senior who punishes critical thinking from juniors is a management problem
- You still did the professionally correct thing

**The hard truth:**

Being a team player doesn't mean abandoning professional judgment. Your systematic debugging skill exists precisely for moments like this.

**If you implement without understanding:**
- You're not learning
- You're creating technical debt
- You're establishing a pattern of blind implementation
- When it breaks in production, you can't explain why

**If you investigate before implementing:**
- You demonstrate professional maturity
- You build debugging skills
- You might catch a real problem
- You earn respect for thinking critically

**Red flag if you think:**
- "They're senior so they must be right"
- "I don't want to seem difficult"
- "It's easier to just implement what they said"

These are social pressures, not technical reasoning. Your job is to write correct code, not to avoid awkward conversations.

---

## Key Lesson

The systematic debugging skill must resist **all** forms of pressure:
- Time pressure (Test 2)
- Sunk cost pressure (Test 3)
- **Social pressure (This test)**

Social pressure is often the hardest because it feels personal. But professional engineering requires pushing back on bad technical decisions, regardless of who suggests them.

A true senior engineer will respect you for thinking critically. If they don't, that's important information about your workplace.
