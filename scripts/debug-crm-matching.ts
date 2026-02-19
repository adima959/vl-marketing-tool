/**
 * Debug: Why does the marketing report show ~47% fewer subs than the dashboard?
 *
 * Compares CRM tracking IDs (tracking_id_4 = campaign, tracking_id_2 = adset)
 * against marketing data (merged_ads_spending.campaign_id, adset_id)
 * for Denmark, 09/01/2026 – 09/02/2026.
 *
 * Run: npx tsx scripts/debug-crm-matching.ts
 */
import mysql from 'mysql2/promise';
import { Pool } from '@neondatabase/serverless';
import { config } from 'dotenv';

config({ path: '.env.local' });

const maria = mysql.createPool({
  host: process.env.MARIADB_HOST,
  port: parseInt(process.env.MARIADB_PORT || '3306'),
  user: process.env.MARIADB_USER,
  password: process.env.MARIADB_PASSWORD,
  database: process.env.MARIADB_DATABASE,
  connectTimeout: 30000,
});

const neon = new Pool({ connectionString: process.env.DATABASE_URL });

// UI shows "09/01/2026 — 09/02/2026" which is DD/MM/YYYY → Jan 9 to Feb 9
const S = '2026-01-09 00:00:00';
const E = '2026-02-09 23:59:59';

async function mq<T>(sql: string, p: unknown[] = []): Promise<T[]> {
  const [rows] = await maria.execute(sql, p);
  return rows as T[];
}

async function pq<T>(sql: string, p: unknown[] = []): Promise<T[]> {
  const { rows } = await neon.query(sql, p);
  return rows as T[];
}

async function main(): Promise<void> {
  console.log('=== CRM → Marketing Matching Diagnostic ===');
  console.log(`Date range: 2026-09-01 to 2026-09-02\n`);

  // ── 1. CRM side: subscriptions with tracking IDs ──────────────────────
  const crmSubs = await mq<{
    id: number;
    source: string | null;
    country: string | null;
    tracking_id: string | null;
    tracking_id_2: string | null;
    tracking_id_4: string | null;
    tag: string | null;
  }>(`
    SELECT s.id,
           COALESCE(sr.source, sr_sub.source) AS source,
           LOWER(c.country) AS country,
           s.tracking_id,
           s.tracking_id_2,
           s.tracking_id_4,
           s.tag
    FROM subscription s
    LEFT JOIN customer c ON c.id = s.customer_id
    LEFT JOIN invoice i ON i.subscription_id = s.id AND i.type = 1
      AND i.id = (SELECT MIN(i2.id) FROM invoice i2 WHERE i2.subscription_id = s.id AND i2.type = 1)
    LEFT JOIN source sr ON sr.id = i.source_id
    LEFT JOIN source sr_sub ON sr_sub.id = s.source_id
    WHERE s.date_create BETWEEN ? AND ?
      AND LOWER(c.country) = 'denmark'
  `, [S, E]);

  const total = crmSubs.length;
  const upsellSubs = crmSubs.filter(r => r.tag && String(r.tag).includes('parent-sub-id='));
  const regular = crmSubs.filter(r => !r.tag || !String(r.tag).includes('parent-sub-id='));

  console.log(`CRM subscriptions (Denmark): ${total}`);
  console.log(`  Upsell subs: ${upsellSubs.length}`);
  console.log(`  Regular subs: ${regular.length}`);

  // Filter to Adwords source
  const adwords = regular.filter(r => {
    const src = (r.source ?? '').toLowerCase();
    return src === 'adwords' || src === 'google';
  });

  console.log(`\n  Regular subs with source=Adwords: ${adwords.length}`);

  // Check tracking IDs
  const hasT4 = adwords.filter(r => r.tracking_id_4 != null && String(r.tracking_id_4).trim() !== '');
  const hasT2 = adwords.filter(r => r.tracking_id_2 != null && String(r.tracking_id_2).trim() !== '');
  const hasBoth = adwords.filter(r =>
    r.tracking_id_4 != null && String(r.tracking_id_4).trim() !== '' &&
    r.tracking_id_2 != null && String(r.tracking_id_2).trim() !== ''
  );
  const hasNeither = adwords.filter(r =>
    (r.tracking_id_4 == null || String(r.tracking_id_4).trim() === '') &&
    (r.tracking_id_2 == null || String(r.tracking_id_2).trim() === '')
  );

  console.log(`\n  Tracking ID coverage (Adwords, Denmark):`);
  console.log(`    Has tracking_id_4 (campaign): ${hasT4.length} (${pct(hasT4.length, adwords.length)})`);
  console.log(`    Has tracking_id_2 (adset):    ${hasT2.length} (${pct(hasT2.length, adwords.length)})`);
  console.log(`    Has BOTH:                     ${hasBoth.length} (${pct(hasBoth.length, adwords.length)})`);
  console.log(`    Has NEITHER:                  ${hasNeither.length} (${pct(hasNeither.length, adwords.length)})`);

  // Sample tracking_id_4 values
  const t4Values = new Map<string, number>();
  for (const r of adwords) {
    const val = r.tracking_id_4 != null ? String(r.tracking_id_4).trim() : '(null)';
    t4Values.set(val, (t4Values.get(val) ?? 0) + 1);
  }
  const t4Sorted = [...t4Values.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`\n  Top 20 tracking_id_4 values (campaign IDs):`);
  for (const [val, count] of t4Sorted.slice(0, 20)) {
    console.log(`    "${val}": ${count} subs`);
  }

  // Sample tracking_id_2 values
  const t2Values = new Map<string, number>();
  for (const r of adwords) {
    const val = r.tracking_id_2 != null ? String(r.tracking_id_2).trim() : '(null)';
    t2Values.set(val, (t2Values.get(val) ?? 0) + 1);
  }
  const t2Sorted = [...t2Values.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`\n  Top 20 tracking_id_2 values (adset IDs):`);
  for (const [val, count] of t2Sorted.slice(0, 20)) {
    console.log(`    "${val}": ${count} subs`);
  }

  // ── 2. Marketing side: campaign_id/adset_id from merged_ads_spending ───
  const marketingIds = await pq<{
    campaign_id: string;
    adset_id: string;
    campaign_name: string;
    adset_name: string;
    impressions: string;
  }>(`
    SELECT m.campaign_id::text AS campaign_id,
           m.adset_id::text AS adset_id,
           m.campaign_name,
           m.adset_name,
           SUM(m.impressions::integer) AS impressions
    FROM merged_ads_spending m
    WHERE m.network = 'Google Ads'
      AND m.date::date BETWEEN '2026-01-09' AND '2026-02-09'
    GROUP BY m.campaign_id, m.adset_id, m.campaign_name, m.adset_name
    ORDER BY SUM(m.impressions::integer) DESC
  `);

  const marketingCampaignIds = new Set(marketingIds.map(r => String(r.campaign_id)));
  const marketingAdsetIds = new Set(marketingIds.map(r => String(r.adset_id)));
  const marketingKeys = new Set(marketingIds.map(r => `Google Ads::${r.campaign_id}::${r.adset_id}`));

  console.log(`\n=== Marketing Data (Google Ads, Denmark dates) ===`);
  console.log(`  Distinct campaign_ids: ${marketingCampaignIds.size}`);
  console.log(`  Distinct adset_ids: ${marketingAdsetIds.size}`);
  console.log(`  Distinct campaign+adset combos: ${marketingKeys.size}`);

  console.log(`\n  Top 10 campaign+adset by impressions:`);
  for (const r of marketingIds.slice(0, 10)) {
    console.log(`    ${r.campaign_id} / ${r.adset_id} — "${r.campaign_name}" / "${r.adset_name}" (${r.impressions} impr)`);
  }

  // ── 3. Match CRM → Marketing ─────────────────────────────────────────
  console.log(`\n=== Matching Results ===`);

  let matched = 0;
  let unmatchedNullT4 = 0;
  let unmatchedNullT2 = 0;
  let unmatchedCampaignMiss = 0;
  let unmatchedAdsetMiss = 0;
  let unmatchedKeyMiss = 0;

  const unmatchedCampaignSamples: string[] = [];
  const unmatchedAdsetSamples: string[] = [];

  for (const r of adwords) {
    const t4 = r.tracking_id_4 != null ? String(r.tracking_id_4).trim() : '';
    const t2 = r.tracking_id_2 != null ? String(r.tracking_id_2).trim() : '';
    const key = `Google Ads::${t4}::${t2}`;

    if (marketingKeys.has(key)) {
      matched++;
    } else if (t4 === '') {
      unmatchedNullT4++;
    } else if (t2 === '') {
      unmatchedNullT2++;
    } else if (!marketingCampaignIds.has(t4)) {
      unmatchedCampaignMiss++;
      if (unmatchedCampaignSamples.length < 5) {
        unmatchedCampaignSamples.push(`sub ${r.id}: campaign="${t4}" adset="${t2}"`);
      }
    } else if (!marketingAdsetIds.has(t2)) {
      unmatchedAdsetMiss++;
      if (unmatchedAdsetSamples.length < 5) {
        unmatchedAdsetSamples.push(`sub ${r.id}: campaign="${t4}" adset="${t2}"`);
      }
    } else {
      // Both IDs exist in marketing but the combo doesn't
      unmatchedKeyMiss++;
    }
  }

  console.log(`  Total Adwords regular subs (Denmark): ${adwords.length}`);
  console.log(`  Matched to marketing row:    ${matched} (${pct(matched, adwords.length)})`);
  console.log(`  Unmatched — null campaign:   ${unmatchedNullT4} (${pct(unmatchedNullT4, adwords.length)})`);
  console.log(`  Unmatched — null adset:      ${unmatchedNullT2} (${pct(unmatchedNullT2, adwords.length)})`);
  console.log(`  Unmatched — campaign not in marketing: ${unmatchedCampaignMiss} (${pct(unmatchedCampaignMiss, adwords.length)})`);
  console.log(`  Unmatched — adset not in marketing:    ${unmatchedAdsetMiss} (${pct(unmatchedAdsetMiss, adwords.length)})`);
  console.log(`  Unmatched — combo not in marketing:    ${unmatchedKeyMiss} (${pct(unmatchedKeyMiss, adwords.length)})`);

  if (unmatchedCampaignSamples.length > 0) {
    console.log(`\n  Sample subs with campaign ID not in marketing:`);
    for (const s of unmatchedCampaignSamples) console.log(`    ${s}`);
  }
  if (unmatchedAdsetSamples.length > 0) {
    console.log(`\n  Sample subs with adset ID not in marketing:`);
    for (const s of unmatchedAdsetSamples) console.log(`    ${s}`);
  }

  // ── 4. Also check ALL sources (not just Adwords) ─────────────────────
  console.log(`\n=== All Sources (Denmark, regular subs) ===`);
  const sourceCount = new Map<string, number>();
  for (const r of regular) {
    const src = (r.source ?? '(null)').toLowerCase();
    sourceCount.set(src, (sourceCount.get(src) ?? 0) + 1);
  }
  const sourceSorted = [...sourceCount.entries()].sort((a, b) => b[1] - a[1]);
  for (const [src, count] of sourceSorted) {
    console.log(`  ${src}: ${count} subs`);
  }

  await maria.end();
  await neon.end();
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return (n / total * 100).toFixed(1) + '%';
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
