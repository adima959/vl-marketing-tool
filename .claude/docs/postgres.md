# PostgreSQL Patterns (Neon)

> On-demand reference for writing PostgreSQL queries. For MariaDB, see `docs/mariadb.md`.
>
> **Placeholder syntax**: `$1, $2, $3` — never `?`

## Index Types

| Query Pattern | Index Type | Example |
|--------------|------------|---------|
| `WHERE col = value` | B-tree (default) | `CREATE INDEX idx ON t (col)` |
| `WHERE col > value` | B-tree | `CREATE INDEX idx ON t (col)` |
| `WHERE a = x AND b > y` | Composite | `CREATE INDEX idx ON t (a, b)` |
| `WHERE jsonb @> '{}'` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| `WHERE tsv @@ query` | GIN | `CREATE INDEX idx ON t USING gin (col)` |
| Time-series ranges | BRIN | `CREATE INDEX idx ON t USING brin (col)` |

## Index Patterns

### Composite (equality first, then range)

```sql
CREATE INDEX idx_orders_status_date ON orders (status, created_at);
-- Works for: WHERE status = 'active' AND created_at > '2024-01-01'
```

### Covering (avoids table lookup)

```sql
CREATE INDEX idx_users_email ON users (email) INCLUDE (name, created_at);
-- SELECT email, name, created_at avoids heap fetch
```

### Partial (smaller, faster)

```sql
CREATE INDEX idx_active_users ON users (email) WHERE deleted_at IS NULL;
-- Only indexes active users
```

## Pagination

### Cursor pagination (O(1))

```sql
SELECT * FROM products WHERE id > $1 ORDER BY id LIMIT 20;
```

### OFFSET pagination (O(n) — avoid for deep pages)

```sql
SELECT * FROM products ORDER BY id LIMIT 20 OFFSET 1000;
-- Gets slower as OFFSET grows
```

## Hierarchical Data (Project Pattern)

Dashboards use hierarchical keys with `::` separator:

```sql
-- Parent query (top-level aggregation)
SELECT campaign AS key, SUM(clicks) AS clicks
FROM marketing_data
WHERE date BETWEEN $1 AND $2
GROUP BY campaign
ORDER BY clicks DESC;

-- Child query (drill-down)
SELECT campaign || '::' || ad_group AS key, SUM(clicks) AS clicks
FROM marketing_data
WHERE campaign = $1 AND date BETWEEN $2 AND $3
GROUP BY campaign, ad_group
ORDER BY clicks DESC;
```

## UPSERT

```sql
INSERT INTO settings (user_id, key, value)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, key)
DO UPDATE SET value = EXCLUDED.value;
```

## Data Types

| Use Case | Correct Type | Avoid |
|----------|-------------|-------|
| IDs | `bigint` | `int` for large tables |
| Strings | `text` | `varchar(255)` — no perf difference in PG |
| Timestamps | `timestamptz` | `timestamp` (loses timezone) |
| Money | `numeric(10,2)` | `float` (rounding errors) |
| Flags | `boolean` | `varchar`, `int` |

## Anti-Pattern Detection

```sql
-- Find unindexed foreign keys
SELECT conrelid::regclass, a.attname
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND a.attnum = ANY(i.indkey)
  );

-- Find slow queries (requires pg_stat_statements)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;

-- Check table bloat
SELECT relname, n_dead_tup, last_vacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

## App Schema Notes

### Entity History (`app_entity_history`)

- `entity_id` and `changed_by` are UUID type, `old_value`/`new_value` are JSONB
- Entity tables (`app_products`, `app_angles`, etc.) use UUID `id` columns
- JOINs between `entity_id` and entity `id`: both UUID, no cast needed
- JOINs between `changed_by` (UUID) and `app_users.id` (UUID): no cast needed
- To extract UUID from JSONB: `TRIM(BOTH '"' FROM h.old_value::text)` then compare with `id::text`
- PostgreSQL won't implicitly cast between UUID and text — always match types explicitly

## Neon-Specific

- Connection pooling handled by Neon proxy
- Use `@neondatabase/serverless` for edge functions
- Cold starts: first query may be slower (Neon scales to zero)
- Branching: use Neon branches for schema testing
