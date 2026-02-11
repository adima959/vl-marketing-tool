# Unified Error Handling System Design

**Date:** 2026-02-11
**Status:** Approved
**Goal:** Unify auth and database error handling into a single, global error page system

---

## Problem

Currently, the app has inconsistent error handling:
- **Auth errors** → Full-page `AuthErrorPage` (green, "Refresh Session")
- **Database/network errors** → Local `ErrorMessage` cards (red, "Try Again")
- **Store errors** → Local state in each store
- **No redirect** → Errors don't preserve user's location

This creates:
- Code duplication across components
- Inconsistent UX
- No global error visibility
- Manual error handling in every component

---

## Solution: Global Error System

Transform error handling into a centralized system:
1. **Single ErrorPage component** - Handles all error types with appropriate theming
2. **Extend AuthContext** - Add global error state alongside auth state
3. **Global error handler** - Any component/API can trigger errors globally
4. **Automatic cleanup** - Remove all local error handling code

---

## Architecture

### 1. ErrorPage Component

**Location:** `components/ErrorPage.tsx`

Smart component that adapts UI based on `error.code`:

```tsx
interface ErrorPageProps {
  error: AppError;
  onRetry?: () => void;
}

function ErrorPage({ error, onRetry }: ErrorPageProps) {
  const config = getErrorConfig(error.code);
  const handleRetry = onRetry || (() => window.location.reload());

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md bg-white rounded-lg shadow-md p-8">
        <Icon color={config.iconColor} />
        <h1>{config.title}</h1>
        <p>{error.message}</p>
        <Button color={config.buttonColor} onClick={handleRetry}>
          {config.buttonText}
        </Button>
      </div>
    </div>
  );
}
```

**Error Configuration Map:**

| Error Code | Icon Color | Title | Button Text | Button Color |
|------------|-----------|-------|-------------|--------------|
| `TIMEOUT` | Red | "Request Timeout" | "Try Again" | Red |
| `DATABASE_ERROR` | Red | "Database Error" | "Try Again" | Red |
| `NETWORK_ERROR` | Red | "Connection Error" | "Try Again" | Red |
| Auth (401) | Green | "Authentication Required" | "Refresh Session" | Green |

### 2. AppContext (Extended AuthContext)

**Location:** `contexts/AuthContext.tsx`

Extend existing context to handle all errors:

```tsx
interface AppContextType {
  // Existing auth fields
  user: CRMUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: boolean;

  // New error fields
  appError: AppError | null;
  setAppError: (error: AppError | null) => void;
  clearError: () => void;
}

function AppProvider({ children }) {
  const [appError, setAppError] = useState<AppError | null>(null);

  // Register global error handler
  useEffect(() => {
    registerErrorHandler(setAppError);
  }, []);

  // Render error page if any error exists
  if (authError) {
    const authError = {
      code: 'AUTH_ERROR',
      message: 'Your session has expired...'
    };
    return <ErrorPage error={authError} onRetry={refreshSession} />;
  }

  if (appError) {
    return <ErrorPage error={appError} onRetry={clearError} />;
  }

  return children;
}
```

### 3. Global Error Handler

**Location:** `lib/api/errorHandler.ts` (replaces `authErrorHandler.ts`)

```tsx
let globalErrorCallback: ((error: AppError | null) => void) | null = null;

export function registerErrorHandler(callback: (error: AppError | null) => void) {
  globalErrorCallback = callback;
}

export function triggerError(error: AppError) {
  if (globalErrorCallback) {
    globalErrorCallback(error);
  }
}

export function clearError() {
  if (globalErrorCallback) {
    globalErrorCallback(null);
  }
}
```

---

## Data Flow

### Error Triggering

**Stores:**
```tsx
// BEFORE:
catch (err) {
  set({ error: normalizeError(err), isLoading: false });
}

// AFTER:
catch (err) {
  triggerError(normalizeError(err));
  set({ isLoading: false });
}
```

**API Clients:**
```tsx
if (!response.ok) {
  const error = normalizeError(await response.json());
  triggerError(error); // Auto-trigger globally
  throw error;
}
```

### Error Display Flow

1. API call fails → `triggerError(error)` called
2. Global callback triggers → `setAppError(error)` in AppContext
3. AppContext renders → `<ErrorPage error={appError} />`
4. User sees full-page error
5. User clicks "Try Again" → `clearError()` → Page reloads at same URL

---

## Migration Plan

### Files to Delete

1. `components/ErrorMessage.tsx` - Replaced by ErrorPage
2. `components/auth/AuthErrorPage.tsx` - Merged into ErrorPage
3. `lib/api/authErrorHandler.ts` - Replaced by errorHandler.ts

### Files to Modify

**Stores** (4 files):
- `stores/dashboardStore.ts`
- `stores/reportStore.ts`
- `stores/onPageStore.ts`
- `stores/validationRateStore.ts`

Changes:
- Remove `error` from state
- Replace `set({ error: ... })` with `triggerError(...)`

**API Clients** (all `*Client.ts`):
- Add `triggerError(error)` before throwing in catch blocks

**All App Pages** (dashboard, marketing-report, on-page-analysis, validation-rate):
- Remove `error` from store destructuring
- Remove `{error && <ErrorMessage />}` JSX
- Error handling now automatic via global ErrorPage in AuthContext

**Components** (GenericDataTable, etc.):
- Remove `error` from store destructuring
- Remove `{error && <ErrorMessage />}` JSX

### Implementation Steps (in order)

1. ✅ Create `ErrorPage` component
2. ✅ Create `errorHandler.ts`
3. ✅ Update `AuthContext` → add `appError` state + ErrorPage rendering
4. ✅ Fix RouteGuard auto-redirect → only redirect if !authError (let user click manually)
5. ⏳ Update stores (one by one, test after each)
6. ⏳ Update API clients
7. ⏳ Update ALL app pages (dashboard, marketing-report, on-page-analysis, validation-rate)
8. ⏳ Remove `ErrorMessage` from remaining components (GenericDataTable, etc.)
9. ⏳ Delete old files
10. ✅ Commit and test

---

## Benefits

**Simplified Code:**
- Remove ~200 lines of error handling code
- Single error component instead of 2
- No local error state in stores
- No error JSX in components

**Better UX:**
- Consistent error experience
- Full-page errors ensure user attention
- Automatic page preservation (URL stays same)
- Clear retry mechanism

**Maintainability:**
- One place to update error messages
- One place to update error styling
- Easier to add new error types
- TypeScript ensures correct error handling

---

## Future Enhancements

- Add error tracking (Sentry integration at `triggerError()`)
- Add error retry count/backoff
- Add "Report Issue" button on errors
- Add specific error codes for better messages
- Add error recovery suggestions based on error type
