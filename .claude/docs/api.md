# API Patterns Reference

## Database Clients

⚠️ **CRITICAL: Different databases use different placeholder syntax**
- PostgreSQL (Neon): `$1, $2, $3` — File: `lib/server/db.ts`
- MariaDB (CRM): `?, ?, ?` — File: `lib/server/mariadb.ts` | Full docs: `docs/database.md`
- Using wrong syntax causes silent failures or SQL injection vulnerabilities

For query examples, read the source files directly.

---

## Response Envelope

**ALWAYS use this format** — frontend relies on discriminated union:

```typescript
// Success: { success: true, data: T }
// Error:   { success: false, error: string }
```

- Always include `data` key on success (not bare results)
- Always include `error` string on failure
- Status codes: `200` success, `400` validation, `401` auth, `500` server
- Types defined in `types/api.ts` (`ApiResponse<T>`)

---

## Error Handling

**File**: `lib/api/errorHandler.ts` — centralized error handler used by all API routes.

Read source directly for `ValidationError`, `DatabaseError`, and the `handleApiError()` helper.

---

## Hierarchical Keys

**Format**: `dimension::value::dimension::value::...`

**Rules**:
1. Use `::` as separator (never `:` alone)
2. Dimension name first, then value
3. Order matches dimension array order (hierarchy depth)

**Examples**: `campaign::Google Ads::adGroup::Brand Campaign`

## Dimension Order = Hierarchy Depth

**CRITICAL**: Array position determines hierarchy level. `dimensions[0]` = depth 0, `dimensions[1]` = depth 1, etc. Reordering dimensions changes the hierarchy. `hasChildren = depth < dimensions.length - 1`.

For query builder implementations, read: `lib/server/marketingQueryBuilder.ts`, `lib/server/onPageQueryBuilder.ts`, `lib/server/crmQueryBuilder.ts`
