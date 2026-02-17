/**
 * Verify all CRM cohorts from .claude/docs/crm-verification.md
 * Runs the same 3 queries as the dashboard and aggregates client-side.
 *
 * Run: npx tsx scripts/verify-crm-cohorts.ts
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';

config({ path: '.env.local' });

interface SaleRow {
  id: number;
  type: 'subscription' | 'ots' | 'upsell';
  customer_id: number;
  is_new_customer: boolean;
  country: string;
  product_group: string;
  product: string;
  source: string;
  has_trial: boolean;
  is_approved: boolean;
  is_on_hold: boolean;
  is_deleted: boolean;
  is_upsell_sub: boolean;
}

interface Metrics {
  customers: number;
  subscriptions: number;
  crossSellSubs: number;
  trials: number;
  crossSellTrials: number;
  trialsApproved: number;
  onHold: number;
  ots: number;
  otsApproved: number;
  upsells: number;
  upsellsApproved: number;
  upsellsDeleted: number;
}

function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function normalizeDim(raw: unknown): string {
  const str = raw != null ? String(raw).trim() : '';
  return str ? toTitleCase(str) : 'Unknown';
}

function computeMetrics(rows: SaleRow[]): Metrics {
  let subscriptions = 0;
  let crossSellSubs = 0;
  let trials = 0;
  let crossSellTrials = 0;
  let trialsApproved = 0;
  let onHold = 0;
  let ots = 0;
  let otsApproved = 0;
  let upsells = 0;
  let upsellsApproved = 0;
  let upsellsDeleted = 0;
  const newCustomerIds = new Set<number>();
  const crossSellCustomerIds = new Set<number>();

  for (const row of rows) {
    if (row.type === 'subscription') {
      if (row.is_upsell_sub) {
        crossSellSubs++;
        if (row.has_trial) crossSellTrials++;
        if (row.is_new_customer) crossSellCustomerIds.add(row.customer_id);
      } else {
        subscriptions++;
        if (row.has_trial) trials++;
        if (row.is_approved) trialsApproved++;
        if (row.is_on_hold) onHold++;
        if (row.is_new_customer) newCustomerIds.add(row.customer_id);
      }
    } else if (row.type === 'ots') {
      ots++;
      if (row.is_approved) otsApproved++;
    } else if (row.type === 'upsell') {
      upsells++;
      if (row.is_deleted) {
        upsellsDeleted++;
      } else if (row.is_approved) {
        upsellsApproved++;
      }
    }
  }

  const customers = newCustomerIds.size;
  return {
    customers,
    subscriptions,
    crossSellSubs,
    trials,
    crossSellTrials,
    trialsApproved,
    onHold,
    ots,
    otsApproved,
    upsells,
    upsellsApproved,
    upsellsDeleted,
  };
}

interface Cohort {
  name: string;
  filter: (row: SaleRow) => boolean;
  crm: { customers?: number; subscriptions?: number; trials?: number };
}

const COHORTS: Cohort[] = [
  {
    name: 'Example 1: Denmark',
    filter: (r) => r.country === 'Denmark',
    crm: { customers: 632, subscriptions: 1104, trials: 861 },
  },
  {
    name: 'Example 2: Denmark > Balansera',
    filter: (r) => r.country === 'Denmark' && r.product_group.toLowerCase().includes('balans'),
    crm: { customers: 371, subscriptions: 500, trials: 424 },
  },
  {
    name: 'Example 3: Adwords (all countries)',
    filter: (r) => r.source.toLowerCase().includes('adwords'),
    crm: { customers: 374, subscriptions: 673, trials: 574 },
  },
  {
    name: 'Example 4: Denmark > Facebook',
    filter: (r) => r.country === 'Denmark' && r.source.toLowerCase().includes('facebook'),
    crm: { customers: 60, subscriptions: 118, trials: 80 },
  },
  {
    name: 'Example 5: Denmark > Balansera > Adwords',
    filter: (r) =>
      r.country === 'Denmark' &&
      r.product_group.toLowerCase().includes('balans') &&
      r.source.toLowerCase().includes('adwords'),
    crm: { customers: 290, subscriptions: 390, trials: 346 },
  },
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MARIADB_HOST,
    port: parseInt(process.env.MARIADB_PORT || '3306'),
    user: process.env.MARIADB_USER,
    password: process.env.MARIADB_PASSWORD,
    database: process.env.MARIADB_DATABASE,
    connectTimeout: 30000,
  });

  const startDate = '2026-01-09 00:00:00';
  const endDate = '2026-02-09 23:59:59';

  // Q1: Subscriptions
  const [q1Raw] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
      s.id, 'subscription' AS type, NULL AS parent_subscription_id,
      s.date_create AS date, c.id AS customer_id,
      (DATE(c.date_registered) = DATE(s.date_create)) AS is_new_customer,
      c.country,
      COALESCE(pg.group_name, pg_sub.group_name) AS product_group,
      COALESCE(p.product_name, p_sub.product_name) AS product,
      COALESCE(p.sku, p_sub.sku) AS sku,
      COALESCE(sr.source, sr_sub.source) AS source,
      i.total,
      (i.id IS NOT NULL) AS has_trial,
      COALESCE(i.is_marked = 1, 0) AS is_approved,
      (i.on_hold_date IS NOT NULL) AS is_on_hold,
      0 AS is_deleted,
      (s.tag IS NOT NULL AND s.tag LIKE '%parent-sub-id=%') AS is_upsell_sub
    FROM subscription s
    LEFT JOIN customer c ON c.id = s.customer_id
    LEFT JOIN invoice i ON i.id = (
      SELECT MIN(i2.id) FROM invoice i2
      WHERE i2.subscription_id = s.id AND i2.type = 1 AND i2.deleted = 0
    )
    LEFT JOIN (SELECT invoice_id, MIN(product_id) AS product_id FROM invoice_product GROUP BY invoice_id) fp ON fp.invoice_id = i.id
    LEFT JOIN product p ON p.id = fp.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?`,
    [startDate, endDate],
  );

  // Q2: OTS
  const [q2Raw] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
      i.id, 'ots' AS type, NULL AS parent_subscription_id,
      i.order_date AS date, c.id AS customer_id,
      NULL AS is_new_customer, c.country,
      COALESCE(pg.group_name, pg_sub.group_name) AS product_group,
      COALESCE(p.product_name, p_sub.product_name) AS product,
      COALESCE(p.sku, p_sub.sku) AS sku,
      COALESCE(sr.source, sr_sub.source) AS source,
      i.total, NULL AS has_trial,
      COALESCE(i.is_marked = 1, 0) AS is_approved,
      (i.on_hold_date IS NOT NULL) AS is_on_hold,
      0 AS is_deleted, 0 AS is_upsell_sub
    FROM invoice i
    LEFT JOIN subscription s ON s.id = i.subscription_id
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN (SELECT invoice_id, MIN(product_id) AS product_id FROM invoice_product GROUP BY invoice_id) fp ON fp.invoice_id = i.id
    LEFT JOIN product p ON p.id = fp.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN product p_sub ON p_sub.id = s.product_id
    LEFT JOIN product_group pg_sub ON pg_sub.id = p_sub.product_group_id
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE i.type = 3 AND i.deleted = 0
      AND i.order_date BETWEEN ? AND ?
      AND (s.id IS NULL OR s.tag IS NULL OR s.tag NOT LIKE '%parent-sub-id=%')`,
    [startDate, endDate],
  );

  // Q3: Upsells
  const [q3Raw] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT
      i.id, 'upsell' AS type, ps.id AS parent_subscription_id,
      ps.date_create AS date, c.id AS customer_id,
      (DATE(c.date_registered) = DATE(ps.date_create)) AS is_new_customer,
      c.country,
      pg.group_name AS product_group,
      p.product_name AS product, p.sku,
      sr.source,
      i.total, NULL AS has_trial,
      COALESCE(i.is_marked = 1, 0) AS is_approved,
      (i.on_hold_date IS NOT NULL) AS is_on_hold,
      i.deleted AS is_deleted, 0 AS is_upsell_sub
    FROM invoice i
    JOIN subscription ps ON ps.id = CAST(
      SUBSTRING_INDEX(i.tag, 'parent-sub-id=', -1) AS UNSIGNED
    ) AND ps.customer_id = i.customer_id
    LEFT JOIN customer c ON c.id = i.customer_id
    LEFT JOIN product p ON p.id = ps.product_id
    LEFT JOIN product_group pg ON pg.id = p.product_group_id
    LEFT JOIN source sr ON sr.id = ps.source_id
    WHERE i.tag LIKE '%parent-sub-id=%'
      AND ps.date_create BETWEEN ? AND ?`,
    [startDate, endDate],
  );

  // Normalize all rows
  function normalize(raw: mysql.RowDataPacket): SaleRow {
    return {
      id: Number(raw.id),
      type: raw.type as SaleRow['type'],
      customer_id: Number(raw.customer_id),
      is_new_customer: Boolean(Number(raw.is_new_customer)),
      country: normalizeDim(raw.country),
      product_group: normalizeDim(raw.product_group),
      product: normalizeDim(raw.product),
      source: normalizeDim(raw.source),
      has_trial: Boolean(Number(raw.has_trial)),
      is_approved: Boolean(Number(raw.is_approved)),
      is_on_hold: Boolean(Number(raw.is_on_hold)),
      is_deleted: Boolean(Number(raw.is_deleted)),
      is_upsell_sub: Boolean(Number(raw.is_upsell_sub)),
    };
  }

  const allRows: SaleRow[] = [
    ...q1Raw.map(normalize),
    ...q2Raw.map(normalize),
    ...q3Raw.map(normalize),
  ];

  console.log(`Total rows: ${allRows.length} (Q1=${q1Raw.length} Q2=${q2Raw.length} Q3=${q3Raw.length})\n`);

  // Run each cohort
  for (const cohort of COHORTS) {
    const filtered = allRows.filter(cohort.filter);
    const m = computeMetrics(filtered);

    const crmSubs = cohort.crm.subscriptions;
    const dashSubs = m.subscriptions + m.crossSellSubs;
    const crmTrials = cohort.crm.trials;
    const dashTrials = m.trials + m.crossSellTrials;

    console.log(`=== ${cohort.name} ===`);
    console.log(`| Metric        | CRM     | Dashboard (shown) | + Cross-sell | = Total   | Match? |`);
    console.log(`|---------------|---------|-------------------|-------------|-----------|--------|`);

    if (cohort.crm.customers != null) {
      console.log(`| Customers     | ${String(cohort.crm.customers).padStart(7)} | ${String(m.customers).padStart(17)} | ${String(0).padStart(11)} | ${String(m.customers).padStart(9)} | ${m.customers === cohort.crm.customers ? ' YES' : ' **NO**'} |`);
    }
    if (crmSubs != null) {
      console.log(`| Subscriptions | ${String(crmSubs).padStart(7)} | ${String(m.subscriptions).padStart(17)} | ${String(m.crossSellSubs).padStart(11)} | ${String(dashSubs).padStart(9)} | ${dashSubs === crmSubs ? ' YES' : ` gap=${crmSubs - dashSubs}`} |`);
    }
    if (crmTrials != null) {
      console.log(`| Trials        | ${String(crmTrials).padStart(7)} | ${String(m.trials).padStart(17)} | ${String(m.crossSellTrials).padStart(11)} | ${String(dashTrials).padStart(9)} | ${dashTrials === crmTrials ? ' YES' : ` gap=${crmTrials - dashTrials}`} |`);
    }
    console.log(`| Appr. Trials  |         | ${String(m.trialsApproved).padStart(17)} |             |           |        |`);
    console.log(`| On Hold       |         | ${String(m.onHold).padStart(17)} |             |           |        |`);
    console.log(`| OTS           |         | ${String(m.ots).padStart(17)} |             |           |        |`);
    console.log(`| OTS Approved  |         | ${String(m.otsApproved).padStart(17)} |             |           |        |`);
    console.log(`| Upsells       |         | ${String(m.upsellsApproved).padStart(17)} |             |           |        |`);
    console.log('');
  }

  await conn.end();
}

main().catch(console.error);
