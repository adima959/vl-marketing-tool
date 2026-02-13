---
paths:
  - "app/api/**"
  - "lib/server/**"
---

# Security Rules

- **SQL placeholders**: PostgreSQL = `$1, $2, $3` | MariaDB = `?, ?, ?` — NEVER mix
- **No template literals** in SQL: `${var}` in query strings = SQL injection
- **Validate input** before database queries — use Zod schemas
- **Generic errors** to client (`"Internal server error"`), details to server logs only
- **No secrets** in code — environment variables only
- **No PII** in logs — never log passwords, tokens, full request bodies
