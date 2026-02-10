/**
 * Phase 0: Data Validation for CRM Matching Improvement
 *
 * Runs 5 checks against MariaDB + PostgreSQL to validate assumptions
 * before writing any production code.
 *
 * Usage: npx tsx scripts/validate-phase0.ts
 */

import { Pool } from '@neondatabase/serverless';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

// --- Database connections (inline, no @/ aliases in scripts) ---

function createPgPool(): Pool {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }
  return new Pool({ connectionString: dbUrl });
}

function createMariaPool(): mysql.Pool {
  return mysql.createPool({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 15000,
  });
}

// --- Helpers ---

function separator(title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function formatPct(num: number, denom: number): string {
  if (denom === 0) return '0.0%';
  return (num / denom * 100).toFixed(1) + '%';
}

// --- Checks ---

async function check0A(maria: mysql.Pool): Promise<void> {
  separator('0A: subscription.tag — ff_vid / ff_funnel_id coverage');
  console.log('\n  NOTE: Column is `tag` (singular), delimiter is comma (,)');

  // Coverage check
  const [coverageRows] = await maria.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN tag LIKE '%ff_vid=%' THEN 1 END) AS has_ff_vid,
      COUNT(CASE WHEN tag LIKE '%ff_funnel_id=%' THEN 1 END) AS has_ff_funnel,
      COUNT(CASE WHEN tag IS NOT NULL AND tag != '' THEN 1 END) AS has_any_tags
    FROM subscription
    WHERE date_create > '2025-01-01' AND deleted = 0
  `);
  const coverage = (coverageRows as any[])[0];
  const total = Number(coverage.total);

  console.log(`  Total subscriptions (since 2025-01-01, not deleted): ${total.toLocaleString()}`);
  console.log(`  Has any tags:        ${Number(coverage.has_any_tags).toLocaleString()} (${formatPct(Number(coverage.has_any_tags), total)})`);
  console.log(`  Has ff_vid:          ${Number(coverage.has_ff_vid).toLocaleString()} (${formatPct(Number(coverage.has_ff_vid), total)})`);
  console.log(`  Has ff_funnel_id:    ${Number(coverage.has_ff_funnel).toLocaleString()} (${formatPct(Number(coverage.has_ff_funnel), total)})`);

  // Test the comma-delimited parsing SQL
  const [parseTest] = await maria.query(`
    SELECT
      id,
      CASE
        WHEN tag LIKE '%ff_vid=%'
        THEN TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(tag, 'ff_vid=', -1), ',', 1))
        ELSE NULL
      END AS parsed_ff_vid,
      CASE
        WHEN tag LIKE '%ff_funnel_id=%'
        THEN TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(tag, 'ff_funnel_id=', -1), ',', 1))
        ELSE NULL
      END AS parsed_ff_funnel_id,
      LEFT(tag, 300) AS tag_preview
    FROM subscription
    WHERE tag LIKE '%ff_vid=%' AND deleted = 0
    ORDER BY date_create DESC
    LIMIT 5
  `);
  const parseSamples = parseTest as any[];

  if (parseSamples.length > 0) {
    console.log('\n  Tag parsing verification (comma delimiter):');
    for (const row of parseSamples) {
      console.log(`\n  --- subscription.id = ${row.id} ---`);
      console.log(`  Parsed ff_vid:       ${row.parsed_ff_vid}`);
      console.log(`  Parsed ff_funnel_id: ${row.parsed_ff_funnel_id}`);
      console.log(`  Raw tag:             ${row.tag_preview}`);
    }
  } else {
    console.log('\n  No subscriptions found with ff_vid in tag.');
  }
}

async function check0B(pg: Pool): Promise<void> {
  separator('0B: Session UTM propagation — NULL rate for non-first page views');

  const result = await pg.query(`
    WITH ranked AS (
      SELECT session_id, utm_source,
        ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at) as rn
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE created_at BETWEEN '2025-01-01' AND '2025-01-31'
        AND session_id IS NOT NULL
    )
    SELECT
      COUNT(*) as total_non_first,
      COUNT(CASE WHEN utm_source IS NULL THEN 1 END) as null_utm,
      ROUND(COUNT(CASE WHEN utm_source IS NULL THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct_null
    FROM ranked WHERE rn > 1
  `);

  const row = result.rows[0];
  console.log(`\n  Non-first page views in sessions (Jan 2025): ${Number(row.total_non_first).toLocaleString()}`);
  console.log(`  With NULL utm_source: ${Number(row.null_utm).toLocaleString()} (${row.pct_null}%)`);
  console.log(`\n  → If pct > 20%, Phase 1 (session first-touch) is high priority`);
  console.log(`  → If pct < 5%, problem is elsewhere`);
}

async function check0C(pg: Pool): Promise<void> {
  separator('0C: session_id population rate');

  const result = await pg.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN session_id IS NOT NULL THEN 1 END) as has_session,
      ROUND(COUNT(CASE WHEN session_id IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct
    FROM remote_session_tracker.event_page_view_enriched_v2
    WHERE created_at BETWEEN '2025-01-01' AND '2025-01-31'
  `);

  const row = result.rows[0];
  console.log(`\n  Total page views (Jan 2025): ${Number(row.total).toLocaleString()}`);
  console.log(`  With session_id: ${Number(row.has_session).toLocaleString()} (${row.pct}%)`);
  console.log(`\n  → If <90%, session first-touch will miss many page views (needs LEFT JOIN fallback)`);
}

async function check0D(maria: mysql.Pool): Promise<void> {
  separator('0D: CRM row count for enriched table sizing');

  const [rows] = await maria.query(`
    SELECT COUNT(*) AS total
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
      AND s.date_create > '2024-01-01'
  `);
  const total = Number((rows as any[])[0].total);

  console.log(`\n  Trial subscriptions since 2024-01-01 (excl. upsells, excl. deleted): ${total.toLocaleString()}`);

  if (total > 1_000_000) {
    console.log(`  → >1M rows: Refresh strategy needs incremental upsert (ON DUPLICATE KEY UPDATE)`);
  } else if (total > 500_000) {
    console.log(`  → 500K–1M rows: Full rebuild possible but incremental preferred`);
  } else {
    console.log(`  → <500K rows: Full TRUNCATE + INSERT is fast enough`);
  }

  // Also get total (all time) for context
  const [allTimeRows] = await maria.query(`
    SELECT COUNT(*) AS total
    FROM subscription s
    INNER JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
    WHERE s.deleted = 0
      AND (i.tag IS NULL OR i.tag NOT LIKE '%parent-sub-id=%')
  `);
  const allTimeTotal = Number((allTimeRows as any[])[0].total);
  console.log(`  All-time (no date filter): ${allTimeTotal.toLocaleString()}`);
}

async function check0E(maria: mysql.Pool): Promise<void> {
  separator('0E: MariaDB write permission test');

  try {
    await maria.query('CREATE TABLE _test_write_access (id INT PRIMARY KEY)');
    console.log('\n  CREATE TABLE: OK');
    await maria.query('DROP TABLE _test_write_access');
    console.log('  DROP TABLE:   OK');
    console.log('  → Write access confirmed');
  } catch (err: any) {
    console.error(`\n  FAILED: ${err.message}`);
    console.error('  → Cannot create tables in MariaDB. Phase 2 enriched table approach is blocked.');
  }
}

// --- Main ---

async function main(): Promise<void> {
  console.log('Phase 0: Data Validation for CRM Matching Improvement');
  console.log(`Run at: ${new Date().toISOString()}\n`);

  const pg = createPgPool();
  const maria = createMariaPool();

  try {
    // MariaDB checks
    await check0A(maria);
    await check0D(maria);
    await check0E(maria);

    // PostgreSQL checks
    await check0B(pg);
    await check0C(pg);

    separator('DONE — Review results above against Decision Gate in plan.md');
  } catch (err: any) {
    console.error('\nFATAL ERROR:', err.message || err);
    process.exit(1);
  } finally {
    await pg.end();
    await maria.end();
  }
}

main();
