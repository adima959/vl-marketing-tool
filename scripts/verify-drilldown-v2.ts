/**
 * Drill-down verification v2: different time frame + untested dimensions.
 * Focus on parent-child consistency across all expansion levels.
 *
 * Time frame: Feb 4-6 (different from v1's Feb 2-7)
 * Dimensions tested:
 *   - countryCode (depth 0) → utmSource, campaign, urlPath
 *   - deviceType (depth 0) → utmSource, countryCode, urlPath
 *   - date (depth 0) → countryCode, deviceType
 *   - osName, browserName (depth 0, non-matchable)
 *   - utmSource → adset, ad (deeper tracking dims)
 *
 * Usage: node --experimental-strip-types scripts/verify-drilldown-v2.ts
 */

import { Pool } from '@neondatabase/serverless';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env.local' });

const START = '2026-02-04';
const END = '2026-02-06';

const pg = new Pool({ connectionString: process.env.DATABASE_URL });
const maria = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectionLimit: 5,
});

// --- Dimension maps ---

const PG_DIM_MAP: Record<string, string> = {
  urlPath: 'url_path',
  pageType: 'page_type',
  utmSource: 'LOWER(utm_source)',
  campaign: 'utm_campaign',
  adset: 'utm_content',
  ad: 'utm_medium',
  webmasterId: 'utm_medium',
  deviceType: 'device_type',
  osName: 'os_name',
  browserName: 'browser_name',
  countryCode: 'country_code',
  timezone: 'timezone',
  visitNumber: 'visit_number',
  localHour: 'local_hour_of_day',
  date: 'created_at::date',
};

const CRM_DIM_MAP: Record<string, { groupBy: string; filterField: string; nullValue?: string; normalizeValue?: (v: string) => string }> = {
  utmSource: { groupBy: 'source_normalized', filterField: 'source_normalized', nullValue: '', normalizeValue: (v) => { const l = v.toLowerCase(); return l === 'adwords' ? 'google' : l; } },
  campaign: { groupBy: 'tracking_id_4', filterField: 'tracking_id_4', nullValue: '' },
  adset: { groupBy: 'tracking_id_2', filterField: 'tracking_id_2', nullValue: '' },
  ad: { groupBy: 'tracking_id', filterField: 'tracking_id', nullValue: '' },
  date: { groupBy: "DATE_FORMAT(date_create, '%Y-%m-%d')", filterField: 'DATE(date_create)' },
  countryCode: { groupBy: 'country_normalized', filterField: 'country_normalized', nullValue: 'Unknown', normalizeValue: (v) => v.toUpperCase() },
};

const PG_NORMALIZED_SOURCE = `CASE WHEN LOWER(utm_source) IN ('google', 'adwords') THEN 'google' WHEN LOWER(utm_source) IN ('facebook', 'meta') THEN 'facebook' ELSE LOWER(COALESCE(utm_source, '')) END`;

function formatDateDim(value: any): string {
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  return String(value);
}

function sep(title: string): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

// --- Query helpers ---

function buildPgParentFilters(parentFilters: Record<string, string>, params: any[]): string {
  const conditions: string[] = [];
  for (const [dimId, value] of Object.entries(parentFilters)) {
    const col = PG_DIM_MAP[dimId];
    if (!col) continue;
    if (value === 'Unknown') {
      conditions.push(`${col} IS NULL`);
    } else {
      params.push(value);
      conditions.push(`${col}::text = $${params.length}`);
    }
  }
  return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
}

function buildCrmParentFilters(parentFilters: Record<string, string>, params: any[]): string {
  const conditions: string[] = [];
  for (const [dimId, value] of Object.entries(parentFilters)) {
    const mapping = CRM_DIM_MAP[dimId];
    if (!mapping) continue;
    if (value === 'Unknown' && mapping.nullValue !== undefined) {
      conditions.push(`${mapping.filterField} = ?`);
      params.push(mapping.nullValue);
    } else {
      const normalized = mapping.normalizeValue ? mapping.normalizeValue(value) : value;
      conditions.push(`${mapping.filterField} = ?`);
      params.push(normalized);
    }
  }
  return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
}

// --- Simulate route query ---

interface SimResult {
  rows: Array<{ dimValue: string; pageViews: number; visitors: number; trials: number; approved: number }>;
  totalTrials: number;
  totalApproved: number;
}

async function simulateQuery(
  currentDim: string,
  parentFilters: Record<string, string> = {}
): Promise<SimResult> {
  const crmMapping = CRM_DIM_MAP[currentDim];
  // Check if any parent filter is for a non-CRM-matchable dimension
  const hasNonMatchableParent = Object.keys(parentFilters).some(dimId => !CRM_DIM_MAP[dimId]);
  const isDirectMatch = !!crmMapping && !hasNonMatchableParent;
  const pgCol = PG_DIM_MAP[currentDim];

  // 1. PG aggregated metrics
  const pgParams: any[] = [START, END];
  const pgParentWhere = buildPgParentFilters(parentFilters, pgParams);

  const pgQuery = `
    SELECT
      ${pgCol} AS dimension_value,
      COUNT(*) AS page_views,
      COUNT(DISTINCT ff_visitor_id) AS unique_visitors
    FROM remote_session_tracker.event_page_view_enriched_v2
    WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
      ${pgParentWhere}
    GROUP BY ${pgCol}
    ORDER BY page_views DESC
    LIMIT 50
  `;
  const pgResult = await pg.query(pgQuery, pgParams);

  // 2. CRM data
  let crmIndex: Map<string, { trials: number; approved: number }>;

  if (isDirectMatch) {
    const crmParams: any[] = [`${START} 00:00:00`, `${END} 23:59:59`];
    const crmParentWhere = buildCrmParentFilters(parentFilters, crmParams);

    const crmQuery = `
      SELECT ${crmMapping.groupBy} AS dimension_value, COUNT(*) AS trials, SUM(is_approved) AS approved
      FROM crm_subscription_enriched
      WHERE date_create BETWEEN ? AND ?
        ${crmParentWhere}
      GROUP BY ${crmMapping.groupBy}
    `;
    const [crmRows] = await maria.execute<mysql.RowDataPacket[]>(crmQuery, crmParams);

    crmIndex = new Map();
    const crmNullVal = crmMapping.nullValue;
    for (const row of crmRows) {
      const raw = row.dimension_value != null ? String(row.dimension_value).toLowerCase() : null;
      const key = (raw === null || raw === 'null' || (crmNullVal !== undefined && raw === crmNullVal)) ? 'unknown' : raw;
      const existing = crmIndex.get(key);
      if (existing) {
        existing.trials += Number(row.trials);
        existing.approved += Number(row.approved);
      } else {
        crmIndex.set(key, { trials: Number(row.trials), approved: Number(row.approved) });
      }
    }
  } else {
    // Non-matchable: tracking + visitor match
    const tmParams: any[] = [START, END];
    const tmParentWhere = buildPgParentFilters(parentFilters, tmParams);

    const tmQuery = `
      SELECT
        ${pgCol} AS dimension_value,
        ${PG_NORMALIZED_SOURCE} AS source,
        COALESCE(utm_campaign, '') AS campaign_id,
        COALESCE(utm_content, '') AS adset_id,
        COALESCE(utm_medium, '') AS ad_id,
        COUNT(DISTINCT ff_visitor_id) AS unique_visitors
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
        ${tmParentWhere}
      GROUP BY ${pgCol}, ${PG_NORMALIZED_SOURCE}, COALESCE(utm_campaign, ''), COALESCE(utm_content, ''), COALESCE(utm_medium, '')
    `;
    const pgTrackingRows = (await pg.query(tmQuery, tmParams)).rows;

    const crmTParams: any[] = [`${START} 00:00:00`, `${END} 23:59:59`];
    const crmTParentWhere = buildCrmParentFilters(parentFilters, crmTParams);

    const [crmTrackingRows] = await maria.execute<mysql.RowDataPacket[]>(
      `SELECT source_normalized AS source, tracking_id_4 AS campaign_id, tracking_id_2 AS adset_id, tracking_id AS ad_id,
              COUNT(*) AS trials, SUM(is_approved) AS approved
       FROM crm_subscription_enriched
       WHERE date_create BETWEEN ? AND ?
         ${crmTParentWhere}
       GROUP BY source_normalized, tracking_id_4, tracking_id_2, tracking_id`,
      crmTParams
    );

    // Visitor match with parent CRM filters
    const vmParams: any[] = [START, END];
    const vmParentWhere = buildPgParentFilters(parentFilters, vmParams);

    const vmQuery = `
      SELECT DISTINCT ${pgCol} AS dimension_value, ff_visitor_id
      FROM remote_session_tracker.event_page_view_enriched_v2
      WHERE created_at >= $1::date AND created_at < ($2::date + interval '1 day')
        AND ff_visitor_id IS NOT NULL
        ${vmParentWhere}
    `;
    const pgVisitorRows = (await pg.query(vmQuery, vmParams)).rows;

    const crmVParams: any[] = [`${START} 00:00:00`, `${END} 23:59:59`];
    const crmVParentWhere = buildCrmParentFilters(parentFilters, crmVParams);

    const [crmVisitorRows] = await maria.execute<mysql.RowDataPacket[]>(
      `SELECT ff_vid, COUNT(*) AS trials, SUM(is_approved) AS approved
       FROM crm_subscription_enriched
       WHERE date_create BETWEEN ? AND ?
         ${crmVParentWhere}
         AND ff_vid IS NOT NULL
       GROUP BY ff_vid`,
      crmVParams
    );

    // Build tracking match
    const norm = (v: any) => v === 'null' || v === null ? '' : String(v);
    const buildKey = (s: string, c: string, a: string, d: string) => [norm(s), norm(c), norm(a), norm(d)].join('::');

    const crmTIndex = new Map<string, { trials: number; approved: number }>();
    for (const row of crmTrackingRows) {
      const key = buildKey(row.source, row.campaign_id, row.adset_id, row.ad_id);
      const e = crmTIndex.get(key) || { trials: 0, approved: 0 };
      e.trials += Number(row.trials);
      e.approved += Number(row.approved);
      crmTIndex.set(key, e);
    }

    const comboTotals = new Map<string, number>();
    for (const row of pgTrackingRows) {
      const key = buildKey(row.source, row.campaign_id, row.adset_id, row.ad_id);
      comboTotals.set(key, (comboTotals.get(key) || 0) + Number(row.unique_visitors));
    }

    const trackingCrm = new Map<string, { trials: number; approved: number }>();
    for (const row of pgTrackingRows) {
      const comboKey = buildKey(row.source, row.campaign_id, row.adset_id, row.ad_id);
      const crmData = crmTIndex.get(comboKey);
      if (!crmData) continue;
      const total = comboTotals.get(comboKey) || 1;
      const proportion = Number(row.unique_visitors) / total;
      const rawDim = currentDim === 'date' ? formatDateDim(row.dimension_value) : row.dimension_value;
      const dimKey = rawDim != null ? String(rawDim).toLowerCase() : 'unknown';
      const e = trackingCrm.get(dimKey) || { trials: 0, approved: 0 };
      e.trials += crmData.trials * proportion;
      e.approved += crmData.approved * proportion;
      trackingCrm.set(dimKey, e);
    }

    // Build visitor match with proportional distribution
    const crmVIndex = new Map<string, { trials: number; approved: number }>();
    for (const row of crmVisitorRows) {
      crmVIndex.set(row.ff_vid, { trials: Number(row.trials), approved: Number(row.approved) });
    }

    const visitorDimCount = new Map<string, number>();
    for (const row of pgVisitorRows) {
      if (!crmVIndex.has(row.ff_visitor_id)) continue;
      visitorDimCount.set(row.ff_visitor_id, (visitorDimCount.get(row.ff_visitor_id) || 0) + 1);
    }

    const visitorCrm = new Map<string, { trials: number; approved: number }>();
    for (const row of pgVisitorRows) {
      const crmData = crmVIndex.get(row.ff_visitor_id);
      if (!crmData) continue;
      const dimCount = visitorDimCount.get(row.ff_visitor_id) || 1;
      const rawDim2 = currentDim === 'date' ? formatDateDim(row.dimension_value) : row.dimension_value;
      const dimKey = rawDim2 != null ? String(rawDim2).toLowerCase() : 'unknown';
      const e = visitorCrm.get(dimKey) || { trials: 0, approved: 0 };
      e.trials += crmData.trials / dimCount;
      e.approved += crmData.approved / dimCount;
      visitorCrm.set(dimKey, e);
    }

    // Merge: visitor first, tracking fallback
    crmIndex = new Map();
    const allKeys = new Set([...trackingCrm.keys(), ...visitorCrm.keys()]);
    for (const key of allKeys) {
      const visitor = visitorCrm.get(key);
      const tracking = trackingCrm.get(key);
      if (visitor && visitor.trials > 0) {
        crmIndex.set(key, { trials: Math.round(visitor.trials), approved: Math.round(visitor.approved) });
      } else if (tracking) {
        crmIndex.set(key, { trials: Math.round(tracking.trials), approved: Math.round(tracking.approved) });
      }
    }
  }

  // 3. Merge PG + CRM
  const results: SimResult = { rows: [], totalTrials: 0, totalApproved: 0 };

  for (const row of pgResult.rows) {
    const rawDimMerge = currentDim === 'date' ? formatDateDim(row.dimension_value) : row.dimension_value;
    let lookupKey = rawDimMerge != null ? String(rawDimMerge).toLowerCase() : 'unknown';
    // Only apply adwords→google for direct CRM match (tracking match uses PG raw values)
    if (isDirectMatch && currentDim === 'utmSource' && lookupKey === 'adwords') lookupKey = 'google';

    const crm = crmIndex.get(lookupKey);
    const trials = crm?.trials ?? 0;
    const approved = crm?.approved ?? 0;
    const pv = Number(row.page_views);

    if (pv <= 1) continue;

    results.rows.push({
      dimValue: rawDimMerge != null ? String(rawDimMerge) : 'Unknown',
      pageViews: pv,
      visitors: Number(row.unique_visitors),
      trials: Math.round(trials * 100) / 100,
      approved: Math.round(approved * 100) / 100,
    });
    results.totalTrials += trials;
    results.totalApproved += approved;
  }

  // Round totals
  results.totalTrials = Math.round(results.totalTrials * 100) / 100;
  results.totalApproved = Math.round(results.totalApproved * 100) / 100;

  return results;
}

function printResults(result: SimResult, limit: number = 15): void {
  console.log('  Value                                    | PageViews | Visitors |  Trials | Approved');
  console.log('  -----------------------------------------|-----------|----------|---------|--------');
  for (const row of result.rows.slice(0, limit)) {
    const val = row.dimValue.substring(0, 41).padEnd(41);
    console.log(`  ${val}| ${String(row.pageViews).padStart(9)} | ${String(row.visitors).padStart(8)} | ${String(row.trials).padStart(7)} | ${String(row.approved).padStart(8)}`);
  }
  if (result.rows.length > limit) console.log(`  ... and ${result.rows.length - limit} more rows`);
  console.log(`  TOTALS: trials=${result.totalTrials}, approved=${result.totalApproved}`);
}

function checkConsistency(parentTrials: number, childTrials: number, label: string, tolerance: number = 2): void {
  const diff = Math.abs(parentTrials - childTrials);
  console.log(`\n  Parent trials: ${parentTrials}`);
  console.log(`  Children sum:  ${childTrials}`);
  if (diff <= tolerance) {
    console.log(`  ✅ ${label}: consistent (diff=${diff})`);
  } else if (childTrials > parentTrials) {
    console.log(`  ⚠️  ${label}: children EXCEED parent by ${diff}`);
  } else {
    console.log(`  ⚠️  ${label}: children UNDER parent by ${diff}`);
  }
}

// --- Tests ---

let passed = 0;
let warned = 0;
const issues: string[] = [];

function record(name: string, parentTrials: number, childTrials: number, tolerance: number = 2): void {
  const diff = Math.abs(parentTrials - childTrials);
  if (diff <= tolerance) {
    passed++;
  } else {
    warned++;
    issues.push(`${name}: parent=${parentTrials} children=${childTrials} diff=${diff}`);
  }
}

async function main(): Promise<void> {
  console.log(`Drill-down Verification v2: ${START} to ${END}\n`);
  await pg.query('SELECT 1');
  await maria.execute('SELECT 1');
  console.log('Connected\n');

  // ======================== PART A: Direct-match dimensions ========================

  // --- A1: countryCode depth 0 ---
  sep('A1: countryCode (depth 0, direct match)');
  const a1 = await simulateQuery('countryCode');
  printResults(a1);

  // Verify against enriched total
  const [enrichedTotal] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched WHERE date_create BETWEEN ? AND ?`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );
  const eTrials = Number(enrichedTotal[0].trials);
  const eApproved = Number(enrichedTotal[0].approved);
  console.log(`\n  Enriched total: ${eTrials} trials, ${eApproved} approved`);
  checkConsistency(eTrials, a1.totalTrials, 'countryCode vs enriched', 0);
  record('A1: countryCode total', eTrials, a1.totalTrials, 0);

  // --- A2: countryCode=DK → utmSource (direct → direct) ---
  sep('A2: countryCode=DK → utmSource');
  const dkTrials = a1.rows.find(r => r.dimValue === 'DK')?.trials ?? 0;
  const a2 = await simulateQuery('utmSource', { countryCode: 'DK' });
  printResults(a2);
  checkConsistency(dkTrials, a2.totalTrials, 'DK → utmSource');
  record('A2: DK → utmSource', dkTrials, a2.totalTrials);

  // --- A3: countryCode=SE → utmSource (direct → direct) ---
  sep('A3: countryCode=SE → utmSource');
  const seTrials = a1.rows.find(r => r.dimValue === 'SE')?.trials ?? 0;
  const a3 = await simulateQuery('utmSource', { countryCode: 'SE' });
  printResults(a3);
  checkConsistency(seTrials, a3.totalTrials, 'SE → utmSource');
  record('A3: SE → utmSource', seTrials, a3.totalTrials);

  // --- A4: countryCode=DK → campaign (direct → direct) ---
  sep('A4: countryCode=DK → campaign');
  const a4 = await simulateQuery('campaign', { countryCode: 'DK' });
  printResults(a4);
  checkConsistency(dkTrials, a4.totalTrials, 'DK → campaign');
  record('A4: DK → campaign', dkTrials, a4.totalTrials);

  // --- A5: countryCode=DK → urlPath (direct parent → non-matchable child) ---
  sep('A5: countryCode=DK → urlPath (non-matchable with CRM parent filter)');
  const a5 = await simulateQuery('urlPath', { countryCode: 'DK' });
  printResults(a5, 10);
  checkConsistency(dkTrials, a5.totalTrials, 'DK → urlPath', 5);
  record('A5: DK → urlPath', dkTrials, a5.totalTrials, 5);

  // --- A6: countryCode=DK, utmSource=adwords → campaign (3-level) ---
  sep('A6: countryCode=DK, utmSource=adwords → campaign (3-level drill)');
  const dkAdwordsTrials = a2.rows.find(r => r.dimValue.toLowerCase() === 'adwords')?.trials ?? 0;
  const a6 = await simulateQuery('campaign', { countryCode: 'DK', utmSource: 'adwords' });
  printResults(a6);
  checkConsistency(dkAdwordsTrials, a6.totalTrials, 'DK+adwords → campaign');
  record('A6: DK+adwords → campaign', dkAdwordsTrials, a6.totalTrials);

  // ======================== PART B: Non-matchable dimensions ========================

  // --- B1: deviceType depth 0 ---
  sep('B1: deviceType (depth 0, tracking+visitor match)');
  const b1 = await simulateQuery('deviceType');
  printResults(b1);
  console.log(`\n  Enriched total: ${eTrials}`);

  // --- B2: deviceType=phone → utmSource (non-matchable → direct) ---
  sep('B2: deviceType=phone → utmSource');
  const phoneTrials = b1.rows.find(r => r.dimValue === 'phone')?.trials ?? 0;
  const b2 = await simulateQuery('utmSource', { deviceType: 'phone' });
  printResults(b2);
  checkConsistency(phoneTrials, b2.totalTrials, 'phone → utmSource', 3);
  record('B2: phone → utmSource', phoneTrials, b2.totalTrials, 3);

  // --- B3: deviceType=desktop → utmSource ---
  sep('B3: deviceType=desktop → utmSource');
  const desktopTrials = b1.rows.find(r => r.dimValue === 'desktop')?.trials ?? 0;
  const b3 = await simulateQuery('utmSource', { deviceType: 'desktop' });
  printResults(b3);
  checkConsistency(desktopTrials, b3.totalTrials, 'desktop → utmSource', 3);
  record('B3: desktop → utmSource', desktopTrials, b3.totalTrials, 3);

  // --- B4: deviceType=phone → countryCode (non-matchable → direct) ---
  sep('B4: deviceType=phone → countryCode');
  const b4 = await simulateQuery('countryCode', { deviceType: 'phone' });
  printResults(b4);
  checkConsistency(phoneTrials, b4.totalTrials, 'phone → countryCode', 3);
  record('B4: phone → countryCode', phoneTrials, b4.totalTrials, 3);

  // --- B5: deviceType=phone → urlPath (non-matchable → non-matchable) ---
  sep('B5: deviceType=phone → urlPath (non-matchable → non-matchable)');
  const b5 = await simulateQuery('urlPath', { deviceType: 'phone' });
  printResults(b5, 10);
  checkConsistency(phoneTrials, b5.totalTrials, 'phone → urlPath', 5);
  record('B5: phone → urlPath', phoneTrials, b5.totalTrials, 5);

  // ======================== PART C: Date drill-downs ========================

  // --- C1: date depth 0 ---
  sep('C1: date (depth 0, direct match)');
  const c1 = await simulateQuery('date');
  printResults(c1);

  // --- C2: date=2026-02-05 → countryCode ---
  sep('C2: date=2026-02-05 → countryCode');
  const feb5Trials = c1.rows.find(r => r.dimValue === '2026-02-05')?.trials ?? 0;
  const c2 = await simulateQuery('countryCode', { date: '2026-02-05' });
  printResults(c2);
  checkConsistency(feb5Trials, c2.totalTrials, 'Feb 5 → countryCode');
  record('C2: Feb5 → countryCode', feb5Trials, c2.totalTrials);

  // --- C3: date=2026-02-05 → deviceType (direct → non-matchable) ---
  sep('C3: date=2026-02-05 → deviceType (direct parent → non-matchable child)');
  const c3 = await simulateQuery('deviceType', { date: '2026-02-05' });
  printResults(c3);
  checkConsistency(feb5Trials, c3.totalTrials, 'Feb 5 → deviceType', 3);
  record('C3: Feb5 → deviceType', feb5Trials, c3.totalTrials, 3);

  // --- C4: date=2026-02-04 → utmSource ---
  sep('C4: date=2026-02-04 → utmSource');
  const feb4Trials = c1.rows.find(r => r.dimValue === '2026-02-04')?.trials ?? 0;
  const c4 = await simulateQuery('utmSource', { date: '2026-02-04' });
  printResults(c4);
  checkConsistency(feb4Trials, c4.totalTrials, 'Feb 4 → utmSource');
  record('C4: Feb4 → utmSource', feb4Trials, c4.totalTrials);

  // --- C5: date=2026-02-05, countryCode=DK → utmSource (3-level from date) ---
  sep('C5: date=2026-02-05, countryCode=DK → utmSource (3-level)');
  const feb5DkTrials = c2.rows.find(r => r.dimValue === 'DK')?.trials ?? 0;
  const c5 = await simulateQuery('utmSource', { date: '2026-02-05', countryCode: 'DK' });
  printResults(c5);
  checkConsistency(feb5DkTrials, c5.totalTrials, 'Feb5+DK → utmSource');
  record('C5: Feb5+DK → utmSource', feb5DkTrials, c5.totalTrials);

  // ======================== PART D: Other non-matchable dimensions ========================

  // --- D1: osName depth 0 ---
  sep('D1: osName (depth 0, non-matchable)');
  const d1 = await simulateQuery('osName');
  printResults(d1);
  console.log(`\n  Enriched total: ${eTrials}`);

  // --- D2: browserName depth 0 ---
  sep('D2: browserName (depth 0, non-matchable)');
  const d2 = await simulateQuery('browserName');
  printResults(d2);
  console.log(`\n  Enriched total: ${eTrials}`);

  // ======================== PART E: Deeper tracking dimensions ========================

  // --- E1: utmSource depth 0 (baseline) ---
  sep('E1: utmSource (depth 0, baseline)');
  const e1 = await simulateQuery('utmSource');
  printResults(e1);

  // --- E2: utmSource=adwords → adset ---
  sep('E2: utmSource=adwords → adset');
  const adwordsTrials = e1.rows.find(r => r.dimValue.toLowerCase() === 'adwords')?.trials ?? 0;
  const e2 = await simulateQuery('adset', { utmSource: 'adwords' });
  printResults(e2);
  checkConsistency(adwordsTrials, e2.totalTrials, 'adwords → adset');
  record('E2: adwords → adset', adwordsTrials, e2.totalTrials);

  // --- E3: utmSource=facebook → adset ---
  sep('E3: utmSource=facebook → adset');
  const fbTrials = e1.rows.find(r => r.dimValue.toLowerCase() === 'facebook')?.trials ?? 0;
  const e3 = await simulateQuery('adset', { utmSource: 'facebook' });
  printResults(e3);
  checkConsistency(fbTrials, e3.totalTrials, 'facebook → adset');
  record('E3: facebook → adset', fbTrials, e3.totalTrials);

  // --- E4: utmSource=adwords → ad ---
  sep('E4: utmSource=adwords → ad');
  const e4 = await simulateQuery('ad', { utmSource: 'adwords' });
  printResults(e4);
  checkConsistency(adwordsTrials, e4.totalTrials, 'adwords → ad');
  record('E4: adwords → ad', adwordsTrials, e4.totalTrials);

  // --- E5: utmSource=adwords, campaign=top → adset (3-level tracking drill) ---
  sep('E5: adwords → top campaign → adset (3-level tracking drill)');
  const topAdwordsCampaign = (await simulateQuery('campaign', { utmSource: 'adwords' })).rows.find(r => r.trials > 0);
  if (topAdwordsCampaign) {
    console.log(`  Drilling: adwords → campaign=${topAdwordsCampaign.dimValue} (${topAdwordsCampaign.trials} trials) → adset\n`);
    const e5 = await simulateQuery('adset', { utmSource: 'adwords', campaign: topAdwordsCampaign.dimValue });
    printResults(e5);
    checkConsistency(topAdwordsCampaign.trials, e5.totalTrials, 'adwords+campaign → adset');
    record('E5: adwords+campaign → adset', topAdwordsCampaign.trials, e5.totalTrials);
  } else {
    console.log('  No adwords campaigns with trials found');
  }

  // ======================== SUMMARY ========================

  sep('FINAL SUMMARY');
  console.log(`  Time range: ${START} to ${END}`);
  console.log(`  Enriched total: ${eTrials} trials, ${eApproved} approved`);
  console.log(`\n  Passed: ${passed}`);
  console.log(`  Warned: ${warned}`);
  if (issues.length > 0) {
    console.log('\n  Issues:');
    for (const issue of issues) {
      console.log(`    ⚠️  ${issue}`);
    }
  } else {
    console.log('\n  ✅ All parent-child consistency checks passed!');
  }

  await pg.end();
  await maria.end();
}

main().catch(err => { console.error(err); process.exit(1); });
