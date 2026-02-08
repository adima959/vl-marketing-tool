# Security Rules

> Applied when writing API routes, database queries, or handling user input.

## Quick Decision

| Area | Rule |
|------|------|
| SQL queries | ALWAYS parameterized. PostgreSQL: `$1, $2`. MariaDB: `?` |
| User input | Validate before processing. Never trust raw input |
| Error responses | Generic messages to client. Details in server logs only |
| Secrets | Environment variables only. Never hardcode |
| Logging | Never log passwords, tokens, or PII |

## SQL Injection Prevention

### PostgreSQL (Neon) — `$1, $2, $3`

```typescript
// ✅ Parameterized
await db.query('SELECT * FROM users WHERE id = $1', [userId])

// ❌ String concatenation — SQL INJECTION
await db.query(`SELECT * FROM users WHERE id = ${userId}`)
```

### MariaDB (CRM) — `?, ?, ?`

```typescript
// ✅ Parameterized
await pool.query('SELECT * FROM subscription WHERE id = ?', [subId])

// ❌ String concatenation — SQL INJECTION
await pool.query(`SELECT * FROM subscription WHERE id = ${subId}`)
```

**CRITICAL**: Never mix placeholder syntax between databases. See CLAUDE.md "Critical Warnings".

## API Route Validation

```typescript
export async function POST(request: Request) {
  try {
    const body = await request.json()

    // ✅ Validate before use
    if (!body.dateRange?.start || !body.dateRange?.end) {
      return NextResponse.json(
        { success: false, error: 'Invalid date range' },
        { status: 400 }
      )
    }

    // ... process validated input ...

  } catch (error) {
    // ✅ Generic error to client, details to server log
    console.error('API error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## Before Commit Checklist

- [ ] No hardcoded secrets (API keys, passwords, connection strings)
- [ ] All SQL uses parameterized queries (correct placeholder per DB)
- [ ] User input validated before database queries
- [ ] Error responses don't leak stack traces or internal details
- [ ] `.env` files in `.gitignore`
- [ ] No sensitive data in `console.log` statements

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Template literal in SQL | Use `$1` / `?` placeholders |
| `error.message` in API response | Return generic "Internal server error" |
| Logging full request body | Log only non-sensitive fields |
| Hardcoded DB connection string | Use `process.env.DATABASE_URL` |
