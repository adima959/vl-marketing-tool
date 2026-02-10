/**
 * Verify drill-down CRM matching across multiple dimensions and depths.
 * Simulates the actual route logic from query/route.ts.
 *
 * Tests dimension chains:
 * 1. utmSource (depth 0, direct match)
 * 2. utmSource=adwords → campaign (depth 1, direct match with parent filter)
 * 3. utmSource=facebook → campaign (depth 1, direct match with parent filter)
 * 4. utmSource=adwords → urlPath (depth 1, tracking+visitor match with parent filter)
 * 5. date (depth 0, direct match)
 * 6. deviceType (depth 0, non-matchable, tracking+visitor match)
 * 7. countryCode (depth 0, direct match)
 * 8. campaign → urlPath (depth 1, tracking+visitor match)
 * 9. utmSource → campaign → urlPath (3-level drill-down)
 *
 * Usage: node --experimental-strip-types scripts/verify-drilldown.ts
 */

import { Pool } from '@neondatabase/serverless';
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ path: '.env.local' });

const START = '2026-02-02';
const END = '2026-02-07';

const pg = new Pool({ connectionString: process.env.DATABASE_URL });
const maria = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectionLimit: 5,
});

// --- Dimension maps (mirrors onPageQueryBuilder.ts + onPageCrmQueries.ts) ---

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

// --- Helpers to build queries ---

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

// --- Simulate route for one dimension+depth ---

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
    // Direct CRM match
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
    // Non-matchable: tracking match + visitor match
    // Tracking match
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

    // CRM tracking combos
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

    // Visitor match
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

    // Build visitor match
    const crmVIndex = new Map<string, { trials: number; approved: number }>();
    for (const row of crmVisitorRows) {
      crmVIndex.set(row.ff_vid, { trials: Number(row.trials), approved: Number(row.approved) });
    }

    // Count dim values per visitor for proportional distribution
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

    // Merge: visitor first, tracking fallback (mirrors route logic)
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

    if (pv <= 1) continue; // Noise filter (matches route)

    results.rows.push({
      dimValue: rawDimMerge != null ? String(rawDimMerge) : 'Unknown',
      pageViews: pv,
      visitors: Number(row.unique_visitors),
      trials,
      approved,
    });
    results.totalTrials += trials;
    results.totalApproved += approved;
  }

  return results;
}

function printResults(result: SimResult, limit: number = 15): void {
  console.log('  Value                                    | PageViews | Visitors | Trials | Approved');
  console.log('  -----------------------------------------|-----------|----------|--------|--------');
  for (const row of result.rows.slice(0, limit)) {
    const val = row.dimValue.substring(0, 41).padEnd(41);
    console.log(`  ${val}| ${String(row.pageViews).padStart(9)} | ${String(row.visitors).padStart(8)} | ${String(row.trials).padStart(6)} | ${String(row.approved).padStart(8)}`);
  }
  if (result.rows.length > limit) console.log(`  ... and ${result.rows.length - limit} more rows`);
  console.log(`  TOTALS: trials=${result.totalTrials}, approved=${result.totalApproved}`);
}

// --- Main test scenarios ---

async function main(): Promise<void> {
  console.log(`Drill-down CRM Verification: ${START} to ${END}\n`);
  await pg.query('SELECT 1');
  await maria.execute('SELECT 1');
  console.log('✅ Connected\n');

  // --- Scenario 1: utmSource depth 0 ---
  sep('SCENARIO 1: utmSource (depth 0, direct match)');
  const s1 = await simulateQuery('utmSource');
  printResults(s1);

  // --- Scenario 2: utmSource=adwords → campaign ---
  sep('SCENARIO 2: utmSource=adwords → campaign (depth 1, direct match)');
  const s2 = await simulateQuery('campaign', { utmSource: 'adwords' });
  printResults(s2);

  // Check: s2 total trials should == s1's adwords trials
  const adwordsTrials = s1.rows.find(r => r.dimValue.toLowerCase() === 'adwords')?.trials ?? 0;
  console.log(`\n  Parent (adwords) trials: ${adwordsTrials}`);
  console.log(`  Sum of children trials:  ${s2.totalTrials}`);
  if (Math.abs(adwordsTrials - s2.totalTrials) <= 1) console.log('  ✅ Consistent');
  else console.log(`  ⚠️  MISMATCH: diff=${adwordsTrials - s2.totalTrials}`);

  // --- Scenario 3: utmSource=facebook → campaign ---
  sep('SCENARIO 3: utmSource=facebook → campaign (depth 1, direct match)');
  const s3 = await simulateQuery('campaign', { utmSource: 'facebook' });
  printResults(s3);

  const fbTrials = s1.rows.find(r => r.dimValue.toLowerCase() === 'facebook')?.trials ?? 0;
  console.log(`\n  Parent (facebook) trials: ${fbTrials}`);
  console.log(`  Sum of children trials:   ${s3.totalTrials}`);
  if (Math.abs(fbTrials - s3.totalTrials) <= 1) console.log('  ✅ Consistent');
  else console.log(`  ⚠️  MISMATCH: diff=${fbTrials - s3.totalTrials}`);

  // --- Scenario 4: utmSource=adwords → urlPath (non-matchable with parent filter) ---
  sep('SCENARIO 4: utmSource=adwords → urlPath (depth 1, tracking+visitor match)');
  const s4 = await simulateQuery('urlPath', { utmSource: 'adwords' });
  printResults(s4);
  console.log(`\n  Parent (adwords) trials: ${adwordsTrials}`);
  console.log(`  Sum of children trials:  ${s4.totalTrials}`);
  // Note: for non-matchable dims with tracking/visitor match, totals may differ
  // because CRM parent filters aren't applied to visitor match (only date range)
  if (s4.totalTrials > adwordsTrials * 1.5) {
    console.log(`  ⚠️  Children sum significantly exceeds parent — possible over-attribution`);
  } else if (s4.totalTrials < adwordsTrials * 0.5) {
    console.log(`  ⚠️  Children sum much less than parent — many trials unattributed to URLs`);
  } else {
    console.log(`  ℹ️  Non-matchable dim: some variance expected (tracking+visitor match is approximate)`);
  }

  // --- Scenario 5: date (depth 0, direct match) ---
  sep('SCENARIO 5: date (depth 0, direct match)');
  const s5 = await simulateQuery('date');
  printResults(s5);

  // Verify total matches enriched table total
  const [enrichedTotal] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched WHERE date_create BETWEEN ? AND ?`,
    [`${START} 00:00:00`, `${END} 23:59:59`]
  );
  const eTrials = Number(enrichedTotal[0].trials);
  const eApproved = Number(enrichedTotal[0].approved);
  console.log(`\n  Date sum trials:    ${s5.totalTrials} (enriched: ${eTrials})`);
  console.log(`  Date sum approved:  ${s5.totalApproved} (enriched: ${eApproved})`);
  if (s5.totalTrials === eTrials && s5.totalApproved === eApproved) console.log('  ✅ Matches enriched total');
  else console.log(`  ⚠️  MISMATCH with enriched total`);

  // --- Scenario 6: deviceType (depth 0, non-matchable) ---
  sep('SCENARIO 6: deviceType (depth 0, tracking+visitor match)');
  const s6 = await simulateQuery('deviceType');
  printResults(s6);
  console.log(`\n  Total CRM trials attributed: ${s6.totalTrials} (enriched total: ${eTrials})`);

  // --- Scenario 7: countryCode (depth 0, direct match) ---
  sep('SCENARIO 7: countryCode (depth 0, direct match)');
  const s7 = await simulateQuery('countryCode');
  printResults(s7);
  console.log(`\n  Country sum trials:    ${s7.totalTrials} (enriched: ${eTrials})`);
  console.log(`  Country sum approved:  ${s7.totalApproved} (enriched: ${eApproved})`);
  if (s7.totalTrials === eTrials && s7.totalApproved === eApproved) console.log('  ✅ Matches enriched total');
  else console.log(`  ⚠️  MISMATCH with enriched total`);

  // --- Scenario 8: Pick top campaign, drill into urlPath ---
  sep('SCENARIO 8: Top campaign → urlPath (depth 1, tracking+visitor match)');
  // Get top campaign from s2 (adwords campaigns)
  const topCampaign = s2.rows.find(r => r.trials > 0);
  if (topCampaign) {
    console.log(`  Drilling into campaign: ${topCampaign.dimValue} (${topCampaign.trials} trials)\n`);
    const s8 = await simulateQuery('urlPath', { utmSource: 'adwords', campaign: topCampaign.dimValue });
    printResults(s8, 10);
    console.log(`\n  Parent campaign trials: ${topCampaign.trials}`);
    console.log(`  Sum of child URL trials: ${s8.totalTrials}`);
  } else {
    console.log('  No campaigns with trials found');
  }

  // --- Scenario 9: utmSource=orionmedia → urlPath ---
  sep('SCENARIO 9: utmSource=orionmedia → urlPath (tracking+visitor match)');
  const s9 = await simulateQuery('urlPath', { utmSource: 'orionmedia' });
  printResults(s9, 10);
  const orionTrials = s1.rows.find(r => r.dimValue.toLowerCase() === 'orionmedia')?.trials ?? 0;
  console.log(`\n  Parent (orionmedia) trials: ${orionTrials}`);
  console.log(`  Sum of child URL trials:    ${s9.totalTrials}`);

  // --- Scenario 10: date expansion → utmSource for specific day ---
  sep('SCENARIO 10: date=2026-02-03 → utmSource (direct match with date parent)');
  const s10 = await simulateQuery('utmSource', { date: '2026-02-03' });
  printResults(s10);

  // Verify against enriched for that day
  const [dayEnriched] = await maria.execute<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS trials, SUM(is_approved) AS approved
     FROM crm_subscription_enriched WHERE date_create BETWEEN '2026-02-03 00:00:00' AND '2026-02-03 23:59:59'`
  );
  console.log(`\n  Children sum trials: ${s10.totalTrials} (enriched for Feb 3: ${dayEnriched[0].trials})`);
  if (s10.totalTrials === Number(dayEnriched[0].trials)) console.log('  ✅ Consistent');
  else console.log(`  ⚠️  MISMATCH: diff=${s10.totalTrials - Number(dayEnriched[0].trials)}`);

  sep('SUMMARY');
  console.log('  Review ⚠️ warnings above. For non-matchable dims, some variance is expected');
  console.log('  because tracking+visitor matching is approximate. For direct-matchable');
  console.log('  dims (utmSource, campaign, date, countryCode), totals should be exact.');

  await pg.end();
  await maria.end();
}

main().catch(err => { console.error(err); process.exit(1); });
