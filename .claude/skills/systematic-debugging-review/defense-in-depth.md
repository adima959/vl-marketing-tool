# Defense-in-Depth Validation

## Overview

After finding root cause, add validation at multiple layers to make the bug impossible to reintroduce.

**Core principle:** Single validation = "fixed the bug" | Multiple layers = "made the bug impossible"

## The Four Validation Layers

### Layer 1: Entry Point Validation
Screen data at API boundaries. Reject obviously bad inputs before processing.

```typescript
// Example: validate directory parameter
function createProject(name: string, directory: string) {
  if (!directory || directory.trim() === '') {
    throw new Error('Project directory cannot be empty');
  }
  // ... rest of function
}
```

**Catches:** Obviously invalid inputs, missing required data, type mismatches

### Layer 2: Business Logic Validation
Ensure data meets operational requirements for this specific function.

```typescript
// Example: validate directory is absolute path
function initializeWorkspace(projectDir: string) {
  if (!path.isAbsolute(projectDir)) {
    throw new Error(`Project directory must be absolute path, got: ${projectDir}`);
  }
  // ... rest of function
}
```

**Catches:** Data that's technically valid but operationally wrong for this context

### Layer 3: Environment Guards
Context-specific protections based on where code is running.

```typescript
// Example: prevent dangerous operations in test environment
async function gitInit(directory: string) {
  if (process.env.NODE_ENV === 'test' && !directory.includes('/tmp/')) {
    throw new Error(
      `SAFETY: Refusing git init outside /tmp/ during tests. Got: ${directory}`
    );
  }
  await execFileAsync('git', ['init'], { cwd: directory });
}
```

**Catches:** Operations that are valid in production but dangerous in test/dev

### Layer 4: Debug Instrumentation
Capture diagnostic information for troubleshooting.

```typescript
// Example: log context before dangerous operation
async function gitInit(directory: string) {
  const stack = new Error().stack;
  console.error('DEBUG git init:', {
    directory,
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV,
    stack,
  });
  await execFileAsync('git', ['init'], { cwd: directory });
}
```

**Catches:** Nothing - but surfaces root cause when bugs slip through other layers

## Implementation Strategy

1. **Trace where bad data originates** (root cause investigation)
2. **Identify all points where it flows through** (call chain analysis)
3. **Add validation at each layer** (defense-in-depth)
4. **Test if removing individual layers allows bug** (verification)

## Real Example: Empty Directory Bug

**Bug:** Git init ran in source code directory instead of temp directory

**Layer 1 - Entry validation:**
```typescript
function createProject(name: string, directory: string) {
  if (!directory || directory.trim() === '') {
    throw new Error('Project directory cannot be empty');
  }
}
```

**Layer 2 - Business logic:**
```typescript
function initializeWorkspace(projectDir: string) {
  if (!path.isAbsolute(projectDir)) {
    throw new Error(`Must be absolute path: ${projectDir}`);
  }
}
```

**Layer 3 - Environment guard:**
```typescript
async function gitInit(directory: string) {
  if (process.env.NODE_ENV === 'test' && !directory.includes('/tmp/')) {
    throw new Error(`Test safety: refusing git init outside /tmp/`);
  }
}
```

**Layer 4 - Debug logging:**
```typescript
async function gitInit(directory: string) {
  console.error('DEBUG:', { directory, cwd: process.cwd(), stack: new Error().stack });
}
```

**Result:** Bug became impossible. Each layer catches different failure modes.

## Why All Four Layers?

**Can't we just fix at entry point?**

Different layers catch different failure modes:

- **Entry validation** stops obviously bad calls
- **Business logic** catches edge cases that pass entry checks
- **Environment guards** catch platform/context-specific issues
- **Instrumentation** reveals structural problems (wrong call chain, timing issues)

**Real-world evidence:** All 4 layers proved necessary. Removing any single layer allowed bugs through in different scenarios.

## Testing Defense Layers

After implementing, verify each layer:

```typescript
// Test Layer 1: Entry validation
expect(() => createProject('name', '')).toThrow('cannot be empty');

// Test Layer 2: Business logic
expect(() => initWorkspace('relative/path')).toThrow('absolute path');

// Test Layer 3: Environment guard
process.env.NODE_ENV = 'test';
expect(() => gitInit('/Users/me/code')).toThrow('outside /tmp/');

// Test Layer 4: Check debug logs appear
const logs = captureConsoleError();
await gitInit('/tmp/test');
expect(logs).toContain('DEBUG git init');
```

## Common Mistakes

**❌ Only fixing at symptom point**
Result: Bug reappears when called from different path

**❌ Only validating at entry**
Result: Internal calls bypass validation

**❌ No environment guards**
Result: Tests pollute source directories, CI behaves differently than local

**❌ No debug instrumentation**
Result: When bug slips through, impossible to diagnose

## Key Principle

```
Single fix = Fixed this instance
Layered defense = Made entire bug class impossible
```

When you find a root cause, don't just fix it - make it structurally impossible to reintroduce.

## Real-World Impact

From debugging session (2025-10-03):
- Root cause: empty directory parameter
- Added 4 validation layers
- Result: 1847 tests passed, zero pollution
- Bug became impossible across all call paths
