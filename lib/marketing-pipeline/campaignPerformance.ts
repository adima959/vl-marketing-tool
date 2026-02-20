/**
 * Campaign Performance — fetches live data from 3 sources:
 * 1. Ads (PostgreSQL marketing_merged_ads_spending) — spend, clicks, impressions, conversions
 * 2. CRM (MariaDB via crmQueryBuilder) — subscriptions, trials, approved, upsells, OTS
 * 3. On-page (PostgreSQL event_page_view_enriched_v2) — page views, visitors, forms
 *
 * All queries run in parallel. Results are keyed by externalId (campaign_id).
 */

import { executeQuery } from '@/lib/server/db';
import { fetchCRMSales } from '@/lib/server/crmQueryBuilder';
import { formatLocalDate } from '@/lib/types/api';
import type { CampaignPerformanceData, AdsetPerformance, AdPerformance, AdLandingPage, CampaignHierarchyData } from '@/types';
import type { SaleRow } from '@/types/sales';

interface DateRange {
  start: Date;
  end: Date;
}

// Empty performance record (all zeros)
const EMPTY_PERFORMANCE: CampaignPerformanceData = {
  spend: 0, clicks: 0, impressions: 0, conversions: 0, ctr: 0, cpc: 0,
  subscriptions: 0, trials: 0, trialsApproved: 0, approvalRate: 0,
  upsells: 0, ots: 0, revenue: 0,
  pageViews: 0, uniqueVisitors: 0, formViews: 0, formStarters: 0,
  bounceRate: 0, scrollPastHero: 0, avgTimeOnPage: null,
  trueCpa: null,
};

// ── Ads Query ────────────────────────────────────────────────────────

interface AdsRow {
  campaign_id: string;
  campaign_name: string | null;
  cost: string | number;
  clicks: string | number;
  impressions: string | number;
  conversions: string | number;
}

async function fetchAdsMetrics(
  externalIds: string[],
  dateRange: DateRange,
): Promise<Map<string, Pick<CampaignPerformanceData, 'campaignName' | 'spend' | 'clicks' | 'impressions' | 'conversions' | 'ctr' | 'cpc' | 'lastActivityDate'>>> {
  if (externalIds.length === 0) return new Map();

  const [rows, lastActivityRows] = await Promise.all([
    executeQuery<AdsRow>(`
      SELECT
        m.campaign_id,
        MAX(m.campaign_name) AS campaign_name,
        ROUND(SUM(m.cost::numeric), 2) AS cost,
        SUM(m.clicks::integer) AS clicks,
        SUM(m.impressions::integer) AS impressions,
        ROUND(SUM(m.conversions::numeric), 0) AS conversions
      FROM marketing_merged_ads_spending m
      WHERE m.date >= $1::date AND m.date <= $2::date
        AND m.campaign_id = ANY($3)
      GROUP BY m.campaign_id
    `, [formatLocalDate(dateRange.start), formatLocalDate(dateRange.end), externalIds]),
    executeQuery<{ campaign_id: string; last_date: string }>(`
      SELECT
        m.campaign_id,
        MAX(m.date) AS last_date
      FROM marketing_merged_ads_spending m
      WHERE m.campaign_id = ANY($1)
        AND m.cost::numeric > 0
      GROUP BY m.campaign_id
    `, [externalIds]),
  ]);

  const lastActivityMap = new Map<string, string>();
  for (const row of lastActivityRows) {
    lastActivityMap.set(row.campaign_id, row.last_date);
  }

  // Derive status from last activity date
  const statusMap = new Map<string, 'active' | 'paused' | 'stopped'>();
  const now = new Date();
  for (const [campaignId, lastDate] of lastActivityMap) {
    const diffMs = now.getTime() - new Date(lastDate).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    let status: 'active' | 'paused' | 'stopped';
    if (diffDays <= 3) status = 'active';
    else if (diffDays <= 30) status = 'paused';
    else status = 'stopped';
    statusMap.set(campaignId, status);
  }

  const result = new Map<string, Pick<CampaignPerformanceData, 'campaignName' | 'spend' | 'clicks' | 'impressions' | 'conversions' | 'ctr' | 'cpc' | 'lastActivityDate' | 'campaignStatus'>>();

  // First, process campaigns with data in the current date range
  for (const row of rows) {
    const spend = Number(row.cost) || 0;
    const clicks = Number(row.clicks) || 0;
    const impressions = Number(row.impressions) || 0;
    const conversions = Number(row.conversions) || 0;
    result.set(row.campaign_id, {
      campaignName: row.campaign_name || undefined,
      spend,
      clicks,
      impressions,
      conversions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      lastActivityDate: lastActivityMap.get(row.campaign_id),
      campaignStatus: statusMap.get(row.campaign_id),
    });
  }

  // Then, add campaigns that have historical activity but no data in current range
  for (const [campaignId, lastDate] of lastActivityMap) {
    if (!result.has(campaignId)) {
      result.set(campaignId, {
        campaignName: undefined,
        spend: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        ctr: 0,
        cpc: 0,
        lastActivityDate: lastDate,
        campaignStatus: statusMap.get(campaignId),
      });
    }
  }

  return result;
}

// ── CRM Query (via SaleRow) ──────────────────────────────────────────

function computeCrmMetrics(
  rows: SaleRow[],
  externalIds: string[],
): Map<string, Pick<CampaignPerformanceData, 'subscriptions' | 'trials' | 'trialsApproved' | 'approvalRate' | 'upsells' | 'ots' | 'revenue'>> {
  const idSet = new Set(externalIds);
  const buckets = new Map<string, SaleRow[]>();

  for (const row of rows) {
    const tid4 = row.tracking_id_4;
    if (tid4 && idSet.has(tid4)) {
      const arr = buckets.get(tid4);
      if (arr) arr.push(row);
      else buckets.set(tid4, [row]);
    }
  }

  const result = new Map<string, Pick<CampaignPerformanceData, 'subscriptions' | 'trials' | 'trialsApproved' | 'approvalRate' | 'upsells' | 'ots' | 'revenue'>>();
  for (const [id, saleRows] of buckets) {
    let subscriptions = 0;
    let trials = 0;
    let trialsApproved = 0;
    let upsells = 0;
    let ots = 0;
    let revenue = 0;

    for (const r of saleRows) {
      revenue += r.total;
      if (r.type === 'subscription') {
        subscriptions++;
        if (r.has_trial) trials++;
        if (r.is_approved) trialsApproved++;
      } else if (r.type === 'ots') {
        ots++;
      } else if (r.type === 'upsell') {
        upsells++;
      }
    }

    result.set(id, {
      subscriptions,
      trials,
      trialsApproved,
      approvalRate: subscriptions > 0 ? trialsApproved / subscriptions : 0,
      upsells,
      ots,
      revenue,
    });
  }
  return result;
}

// ── On-Page Query ────────────────────────────────────────────────────

interface OnPageRow {
  campaign_id: string;
  page_views: string | number;
  unique_visitors: string | number;
  form_views: string | number;
  form_starters: string | number;
  bounce_rate: string | number | null;
  scroll_past_hero: string | number;
  avg_time_on_page: string | number | null;
}

type OnPageFields = Pick<CampaignPerformanceData, 'pageViews' | 'uniqueVisitors' | 'formViews' | 'formStarters' | 'bounceRate' | 'scrollPastHero' | 'avgTimeOnPage'>;

async function fetchOnPageMetrics(
  externalIds: string[],
  dateRange: DateRange,
): Promise<Map<string, OnPageFields>> {
  if (externalIds.length === 0) return new Map();

  const startTs = `${formatLocalDate(dateRange.start)}T00:00:00`;
  const endTs = `${formatLocalDate(dateRange.end)}T23:59:59.999`;
  const rows = await executeQuery<OnPageRow>(`
    SELECT
      pv.utm_campaign AS campaign_id,
      COUNT(*) AS page_views,
      COUNT(DISTINCT pv.ff_visitor_id) AS unique_visitors,
      COUNT(*) FILTER (WHERE pv.form_view = true) AS form_views,
      COUNT(*) FILTER (WHERE pv.form_started = true) AS form_starters,
      ROUND(
        COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL AND pv.active_time_s < 5)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL), 0),
        4
      ) AS bounce_rate,
      COUNT(*) FILTER (WHERE pv.hero_scroll_passed = true) AS scroll_past_hero,
      ROUND(AVG(pv.active_time_s)::numeric, 2) AS avg_time_on_page
    FROM remote_session_tracker.event_page_view_enriched_v2 pv
    WHERE pv.created_at >= $1::timestamp AND pv.created_at <= $2::timestamp
      AND pv.utm_campaign = ANY($3)
    GROUP BY pv.utm_campaign
  `, [startTs, endTs, externalIds]);

  const result = new Map<string, OnPageFields>();
  for (const row of rows) {
    result.set(row.campaign_id, {
      pageViews: Number(row.page_views) || 0,
      uniqueVisitors: Number(row.unique_visitors) || 0,
      formViews: Number(row.form_views) || 0,
      formStarters: Number(row.form_starters) || 0,
      bounceRate: Number(row.bounce_rate) || 0,
      scrollPastHero: Number(row.scroll_past_hero) || 0,
      avgTimeOnPage: row.avg_time_on_page != null ? Number(row.avg_time_on_page) : null,
    });
  }
  return result;
}

// ── Orchestrator ─────────────────────────────────────────────────────

/**
 * Fetch live performance data for a set of campaign externalIds.
 * Runs 3 queries in parallel: ads (Neon), CRM (MariaDB), on-page (Neon).
 * Returns a map of externalId → CampaignPerformanceData.
 */
export async function getCampaignPerformance(
  externalIds: string[],
  dateRange: DateRange,
): Promise<Record<string, CampaignPerformanceData>> {
  if (externalIds.length === 0) return {};

  // Each source is independently failable — one DB outage shouldn't block the rest
  const [adsMap, saleRows, onPageMap] = await Promise.all([
    fetchAdsMetrics(externalIds, dateRange).catch(() => new Map() as Awaited<ReturnType<typeof fetchAdsMetrics>>),
    fetchCRMSales(dateRange).catch(() => [] as SaleRow[]),
    fetchOnPageMetrics(externalIds, dateRange).catch(() => new Map() as Awaited<ReturnType<typeof fetchOnPageMetrics>>),
  ]);

  const crmMap = computeCrmMetrics(saleRows, externalIds);

  const result: Record<string, CampaignPerformanceData> = {};
  for (const id of externalIds) {
    const ads = adsMap.get(id);
    const crm = crmMap.get(id);
    const onPage = onPageMap.get(id);

    const merged: CampaignPerformanceData = {
      ...EMPTY_PERFORMANCE,
      ...ads,
      ...crm,
      ...onPage,
    };

    // Compute true CPA = spend / trialsApproved
    merged.trueCpa = merged.trialsApproved > 0
      ? Math.round((merged.spend / merged.trialsApproved) * 100) / 100
      : null;

    result[id] = merged;
  }

  return result;
}

// ── Ad Hierarchy (adset + ad level) ─────────────────────────────────

interface AdsetRow {
  adset_id: string;
  adset_name: string | null;
  cost: string | number;
  clicks: string | number;
  impressions: string | number;
  conversions: string | number;
}

async function fetchAdsetMetrics(
  campaignExternalId: string,
  dateRange: DateRange,
): Promise<AdsetPerformance[]> {
  const rows = await executeQuery<AdsetRow>(`
    SELECT
      m.adset_id,
      MAX(m.adset_name) AS adset_name,
      ROUND(SUM(m.cost::numeric), 2) AS cost,
      SUM(m.clicks::integer) AS clicks,
      SUM(m.impressions::integer) AS impressions,
      ROUND(SUM(m.conversions::numeric), 0) AS conversions
    FROM marketing_merged_ads_spending m
    WHERE m.date >= $1::date AND m.date <= $2::date
      AND m.campaign_id = $3
      AND m.adset_id IS NOT NULL AND m.adset_id != ''
    GROUP BY m.adset_id
    ORDER BY SUM(m.cost::numeric) DESC
  `, [formatLocalDate(dateRange.start), formatLocalDate(dateRange.end), campaignExternalId]);

  return rows.map(row => {
    const spend = Number(row.cost) || 0;
    const clicks = Number(row.clicks) || 0;
    const impressions = Number(row.impressions) || 0;
    const conversions = Number(row.conversions) || 0;
    return {
      adsetId: row.adset_id,
      adsetName: row.adset_name || row.adset_id,
      spend,
      clicks,
      impressions,
      conversions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  });
}

interface AdRow {
  ad_id: string;
  ad_name: string | null;
  adset_id: string;
  cost: string | number;
  clicks: string | number;
  impressions: string | number;
  conversions: string | number;
}

async function fetchAdMetrics(
  campaignExternalId: string,
  dateRange: DateRange,
): Promise<AdPerformance[]> {
  const rows = await executeQuery<AdRow>(`
    SELECT
      m.ad_id,
      MAX(m.ad_name) AS ad_name,
      m.adset_id,
      ROUND(SUM(m.cost::numeric), 2) AS cost,
      SUM(m.clicks::integer) AS clicks,
      SUM(m.impressions::integer) AS impressions,
      ROUND(SUM(m.conversions::numeric), 0) AS conversions
    FROM marketing_merged_ads_spending m
    WHERE m.date >= $1::date AND m.date <= $2::date
      AND m.campaign_id = $3
      AND m.ad_id IS NOT NULL AND m.ad_id != ''
    GROUP BY m.ad_id, m.adset_id
    ORDER BY SUM(m.cost::numeric) DESC
  `, [formatLocalDate(dateRange.start), formatLocalDate(dateRange.end), campaignExternalId]);

  return rows.map(row => {
    const spend = Number(row.cost) || 0;
    const clicks = Number(row.clicks) || 0;
    const impressions = Number(row.impressions) || 0;
    const conversions = Number(row.conversions) || 0;
    return {
      adId: row.ad_id,
      adName: row.ad_name || row.ad_id,
      adsetId: row.adset_id,
      spend,
      clicks,
      impressions,
      conversions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  });
}

// ── Per-Ad Landing Page Metrics ──────────────────────────────────────

interface LandingPageRow {
  ad_id: string;
  url_path: string;
  page_views: string | number;
  unique_visitors: string | number;
  bounce_rate: string | number | null;
  scroll_past_hero: string | number;
  form_views: string | number;
  form_starters: string | number;
  avg_time_on_page: string | number | null;
}

async function fetchAdLandingPages(
  campaignExternalId: string,
  dateRange: DateRange,
): Promise<Record<string, AdLandingPage[]>> {
  const startTs = `${formatLocalDate(dateRange.start)}T00:00:00`;
  const endTs = `${formatLocalDate(dateRange.end)}T23:59:59.999`;
  const rows = await executeQuery<LandingPageRow>(`
    SELECT
      pv.utm_medium AS ad_id,
      pv.url_path,
      COUNT(*) AS page_views,
      COUNT(DISTINCT pv.ff_visitor_id) AS unique_visitors,
      ROUND(
        COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL AND pv.active_time_s < 5)::numeric
        / NULLIF(COUNT(*) FILTER (WHERE pv.active_time_s IS NOT NULL), 0), 4
      ) AS bounce_rate,
      COUNT(*) FILTER (WHERE pv.hero_scroll_passed = true) AS scroll_past_hero,
      COUNT(*) FILTER (WHERE pv.form_view = true) AS form_views,
      COUNT(*) FILTER (WHERE pv.form_started = true) AS form_starters,
      ROUND(AVG(pv.active_time_s)::numeric, 2) AS avg_time_on_page
    FROM remote_session_tracker.event_page_view_enriched_v2 pv
    WHERE pv.created_at >= $1::timestamp AND pv.created_at <= $2::timestamp
      AND pv.utm_campaign = $3
      AND pv.utm_medium IS NOT NULL AND pv.utm_medium != ''
    GROUP BY pv.utm_medium, pv.url_path
    ORDER BY pv.utm_medium, COUNT(*) DESC
  `, [startTs, endTs, campaignExternalId]);

  const result: Record<string, AdLandingPage[]> = {};
  for (const row of rows) {
    const pageViews = Number(row.page_views) || 0;
    const scrollPastHero = Number(row.scroll_past_hero) || 0;
    const formViews = Number(row.form_views) || 0;
    const formStarters = Number(row.form_starters) || 0;
    const lp: AdLandingPage = {
      urlPath: row.url_path,
      pageViews,
      uniqueVisitors: Number(row.unique_visitors) || 0,
      bounceRate: Number(row.bounce_rate) || 0,
      scrollPastHero,
      scrollRate: pageViews > 0 ? scrollPastHero / pageViews : 0,
      formViews,
      formViewRate: pageViews > 0 ? formViews / pageViews : 0,
      formStarters,
      formStartRate: formViews > 0 ? formStarters / formViews : 0,
      avgTimeOnPage: row.avg_time_on_page != null ? Number(row.avg_time_on_page) : null,
    };
    if (!result[row.ad_id]) result[row.ad_id] = [];
    result[row.ad_id].push(lp);
  }
  return result;
}

// ── FunnelFlux IDs ─────────────────────────────────────────────────

async function fetchFunnelFluxIds(
  campaignExternalId: string,
  dateRange: DateRange,
): Promise<string[]> {
  const startTs = `${formatLocalDate(dateRange.start)}T00:00:00`;
  const endTs = `${formatLocalDate(dateRange.end)}T23:59:59.999`;
  const rows = await executeQuery<{ ff_funnel_id: string }>(`
    SELECT DISTINCT pv.ff_funnel_id
    FROM remote_session_tracker.event_page_view_enriched_v2 pv
    WHERE pv.created_at >= $1::timestamp AND pv.created_at <= $2::timestamp
      AND pv.utm_campaign = $3
      AND pv.ff_funnel_id IS NOT NULL AND pv.ff_funnel_id != ''
    LIMIT 10
  `, [startTs, endTs, campaignExternalId]);
  return rows.map(r => r.ff_funnel_id);
}

/**
 * Fetch ad hierarchy (adsets + ads + landing pages) for a single campaign external ID.
 */
export async function getCampaignHierarchy(
  campaignExternalId: string,
  dateRange: DateRange,
): Promise<CampaignHierarchyData> {
  const [adsets, ads, adLandingPages, funnelFluxIds] = await Promise.all([
    fetchAdsetMetrics(campaignExternalId, dateRange),
    fetchAdMetrics(campaignExternalId, dateRange),
    fetchAdLandingPages(campaignExternalId, dateRange).catch(() => ({} as Record<string, AdLandingPage[]>)),
    fetchFunnelFluxIds(campaignExternalId, dateRange).catch(() => [] as string[]),
  ]);
  return { adsets, ads, adLandingPages, funnelFluxIds };
}
