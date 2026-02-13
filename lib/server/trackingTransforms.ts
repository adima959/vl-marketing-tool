import type { CRMSubscriptionRow, CRMOtsRow, CRMTrialRow, SourceSubscriptionRow, SourceOtsRow, SourceTrialRow, SourceCountrySubscriptionRow, SourceCountryOtsRow, SourceCountryTrialRow } from './crmQueryBuilder';
import type { AggregatedMetrics } from './marketingQueryBuilder';
import { SOURCE_MAPPING, COUNTRY_CODE_TO_CRM, matchNetworkToSource } from './crmMetrics';

/**
 * Pure transform functions extracted from marketingQueryBuilder.
 * These handle the JavaScript-side matching of PostgreSQL ads data
 * to MariaDB CRM data via tiered tracking ID matching.
 *
 * Matching is progressive — each CRM row is matched using whatever
 * tracking fields are available (campaign, adset, ad). Rows with
 * partial tracking IDs are still matched at the appropriate tier.
 */

/** Check if a tracking ID field is present and valid */
function isValidTrackingId(id: string | null | undefined): boolean {
  return id != null && id !== 'null' && id !== '';
}

/**
 * Tiered index for progressive tracking ID matching.
 * Each CRM row goes into exactly one tier based on which tracking fields are present.
 * No row appears in multiple tiers, so there's no double-counting.
 */
export interface TieredIndex<T> {
  /** Rows with all 3 tracking IDs: key = campaign|adset|ad */
  full: Map<string, T[]>;
  /** Rows with campaign + adset only: key = campaign|adset */
  campaignAdset: Map<string, T[]>;
  /** Rows with campaign only: key = campaign */
  campaignOnly: Map<string, T[]>;
  /** Rows with no valid tracking IDs — matched by source only */
  sourceOnly: T[];
}

/** Helper to push a row into a Map-based tier */
function pushToTier<T>(map: Map<string, T[]>, key: string, row: T): void {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(row);
}

/**
 * Build a tiered index from CRM rows based on available tracking fields.
 * Works for subscription, OTS, and trial row types.
 */
function buildTieredIndex<T extends { campaign_id: string | null; adset_id: string | null; ad_id: string | null }>(
  rows: T[]
): TieredIndex<T> {
  const index: TieredIndex<T> = {
    full: new Map(),
    campaignAdset: new Map(),
    campaignOnly: new Map(),
    sourceOnly: [],
  };

  for (const row of rows) {
    const hasCampaign = isValidTrackingId(row.campaign_id);
    const hasAdset = isValidTrackingId(row.adset_id);
    const hasAd = isValidTrackingId(row.ad_id);

    if (hasCampaign && hasAdset && hasAd) {
      pushToTier(index.full, `${row.campaign_id}|${row.adset_id}|${row.ad_id}`, row);
    } else if (hasCampaign && hasAdset) {
      pushToTier(index.campaignAdset, `${row.campaign_id}|${row.adset_id}`, row);
    } else if (hasCampaign) {
      pushToTier(index.campaignOnly, `${row.campaign_id}`, row);
    } else {
      index.sourceOnly.push(row);
    }
  }

  return index;
}

/** Build tiered index for CRM subscription rows */
export function buildCrmIndex(
  crmData: CRMSubscriptionRow[]
): TieredIndex<CRMSubscriptionRow> {
  return buildTieredIndex(crmData);
}

/** Build tiered index for OTS rows */
export function buildOtsIndex(
  otsData: CRMOtsRow[]
): TieredIndex<CRMOtsRow> {
  return buildTieredIndex(otsData);
}

/** Build tiered index for trial rows */
export function buildTrialIndex(
  trialData: CRMTrialRow[]
): TieredIndex<CRMTrialRow> {
  return buildTieredIndex(trialData);
}

/** Build cross-product of campaign × adset × ad IDs as pipe-delimited keys */
function buildCrossProductKeys(campaignIds: string[], adsetIds: string[], adIds: string[]): string[] {
  const keys: string[] = [];
  for (const c of campaignIds)
    for (const a of adsetIds)
      for (const d of adIds)
        keys.push(`${c}|${a}|${d}`);
  return keys;
}

/** Build cross-product of campaign × adset IDs as pipe-delimited keys */
function buildCampaignAdsetKeys(campaignIds: string[], adsetIds: string[]): string[] {
  const keys: string[] = [];
  for (const c of campaignIds)
    for (const a of adsetIds)
      keys.push(`${c}|${a}`);
  return keys;
}

/**
 * Collect all matching rows from a tiered index across all tiers.
 * Each row appears in exactly one tier, so no double-counting occurs.
 */
function collectMatchingRows<T>(
  index: TieredIndex<T>,
  campaignIds: string[],
  adsetIds: string[],
  adIds: string[]
): T[] {
  const matched: T[] = [];

  // Tier 1: Full match (campaign × adset × ad)
  const fullKeys = buildCrossProductKeys(campaignIds, adsetIds, adIds);
  for (const key of fullKeys) {
    const rows = index.full.get(key);
    if (rows) matched.push(...rows);
  }

  // Tier 2: Campaign + adset (ad missing in CRM)
  const caKeys = buildCampaignAdsetKeys(campaignIds, adsetIds);
  for (const key of caKeys) {
    const rows = index.campaignAdset.get(key);
    if (rows) matched.push(...rows);
  }

  // Tier 3: Campaign only (adset + ad missing in CRM)
  for (const cid of campaignIds) {
    const rows = index.campaignOnly.get(cid);
    if (rows) matched.push(...rows);
  }

  // Tier 4: Source only (no tracking IDs in CRM)
  matched.push(...index.sourceOnly);

  return matched;
}

/**
 * Match a single ads row to CRM, OTS, and trial data via tiered tracking ID matching.
 *
 * For each tier, collects matching rows and verifies network → source matching.
 * Progressive matching ensures rows with partial tracking IDs are still included.
 *
 * Critical formulas:
 * - approval_rate = trials_approved / subscriptions (0 when no subscriptions)
 * - ots_approval_rate = ots_approved / ots (0 when no OTS)
 * - upsell_approval_rate = upsells_approved / upsells (0 when no upsells)
 * - real_cpa = cost / trials_approved (0 when no approvals)
 */
export function matchAdsToCrm(
  adsRow: {
    campaign_ids: string[];
    adset_ids: string[];
    ad_ids: string[];
    networks: string[];
    cost: number;
    clicks: number;
    impressions: number;
    conversions: number;
    ctr_percent: number;
    cpc: number;
    cpm: number;
    conversion_rate: number;
    dimension_value: string;
  },
  crmIndex: TieredIndex<CRMSubscriptionRow>,
  otsIndex: TieredIndex<CRMOtsRow>,
  trialIndex: TieredIndex<CRMTrialRow>
): AggregatedMetrics {
  let subscriptions = 0;
  let customers = 0;
  let upsells = 0;
  let upsells_approved = 0;
  let ots = 0;
  let ots_approved = 0;
  let trials = 0;
  let trials_approved = 0;
  let on_hold = 0;

  // Collect and accumulate CRM subscription matches across all tiers
  const crmMatched = collectMatchingRows(crmIndex, adsRow.campaign_ids, adsRow.adset_ids, adsRow.ad_ids);
  for (const crm of crmMatched) {
    if (!adsRow.networks.some(n => matchNetworkToSource(n, crm.source))) continue;
    subscriptions += Number(crm.subscription_count || 0);
    customers += Number(crm.customer_count || 0);
    upsells += Number(crm.upsell_count || 0);
    upsells_approved += Number(crm.upsells_approved_count || 0);
  }

  // Collect and accumulate OTS matches across all tiers
  const otsMatched = collectMatchingRows(otsIndex, adsRow.campaign_ids, adsRow.adset_ids, adsRow.ad_ids);
  for (const otsRow of otsMatched) {
    if (!adsRow.networks.some(n => matchNetworkToSource(n, otsRow.source))) continue;
    ots += Number(otsRow.ots_count || 0);
    ots_approved += Number(otsRow.ots_approved_count || 0);
  }

  // Collect and accumulate trial matches across all tiers
  const trialMatched = collectMatchingRows(trialIndex, adsRow.campaign_ids, adsRow.adset_ids, adsRow.ad_ids);
  for (const trialRow of trialMatched) {
    if (!adsRow.networks.some(n => matchNetworkToSource(n, trialRow.source))) continue;
    trials += Number(trialRow.trial_count || 0);
    trials_approved += Number(trialRow.trials_approved_count || 0);
    on_hold += Number(trialRow.on_hold_count || 0);
  }

  return {
    dimension_value: adsRow.dimension_value,
    cost: adsRow.cost,
    clicks: adsRow.clicks,
    impressions: adsRow.impressions,
    conversions: adsRow.conversions,
    ctr_percent: adsRow.ctr_percent,
    cpc: adsRow.cpc,
    cpm: adsRow.cpm,
    conversion_rate: adsRow.conversion_rate,
    subscriptions,
    trials_approved,
    trials,
    customers,
    ots,
    ots_approved,
    upsells,
    upsells_approved,
    on_hold,
    approval_rate: subscriptions > 0 ? trials_approved / subscriptions : 0,
    ots_approval_rate: ots > 0 ? ots_approved / ots : 0,
    upsell_approval_rate: upsells > 0 ? upsells_approved / upsells : 0,
    real_cpa: trials_approved > 0 ? adsRow.cost / trials_approved : 0,
  };
}

// ---------------------------------------------------------------------------
// Source-level matching (for network dimension and "Unknown" row computation)
// ---------------------------------------------------------------------------

/** Build a source-keyed index from any row type with a source field */
export function buildSourceIndex<T extends { source: string | null }>(rows: T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const row of rows) {
    const key = (row.source || '').toLowerCase();
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(row);
  }
  return index;
}

/** Shared ads row shape for matching functions */
interface AdsRowInput {
  networks: string[];
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr_percent: number;
  cpc: number;
  cpm: number;
  conversion_rate: number;
  dimension_value: string;
}

/**
 * Match a single ads row to source-level CRM data by network → source mapping.
 * Used when dimensions don't need tracking-level granularity (e.g., network dimension).
 * Gives accurate COUNT(DISTINCT ...) totals since CRM was grouped by source.
 */
export function matchAdsToCrmBySource(
  adsRow: AdsRowInput,
  subIndex: Map<string, SourceSubscriptionRow[]>,
  otsIndex: Map<string, SourceOtsRow[]>,
  trialIndex: Map<string, SourceTrialRow[]>
): AggregatedMetrics {
  let subscriptions = 0, customers = 0, upsells = 0, upsells_approved = 0;
  let ots = 0, ots_approved = 0;
  let trials = 0, trials_approved = 0, on_hold = 0;

  // Deduplicate source lookups across networks
  const visited = new Set<string>();
  for (const network of adsRow.networks) {
    const validSources = SOURCE_MAPPING[network.toLowerCase()] || [];
    for (const src of validSources) {
      if (visited.has(src)) continue;
      visited.add(src);

      const subRows = subIndex.get(src);
      if (subRows) {
        for (const r of subRows) {
          subscriptions += Number(r.subscription_count || 0);
          customers += Number(r.customer_count || 0);
          upsells += Number(r.upsell_count || 0);
          upsells_approved += Number(r.upsells_approved_count || 0);
        }
      }

      const otsRows = otsIndex.get(src);
      if (otsRows) {
        for (const r of otsRows) {
          ots += Number(r.ots_count || 0);
          ots_approved += Number(r.ots_approved_count || 0);
        }
      }

      const trialRows = trialIndex.get(src);
      if (trialRows) {
        for (const r of trialRows) {
          trials += Number(r.trial_count || 0);
          trials_approved += Number(r.trials_approved_count || 0);
          on_hold += Number(r.on_hold_count || 0);
        }
      }
    }
  }

  return {
    dimension_value: adsRow.dimension_value,
    cost: adsRow.cost,
    clicks: adsRow.clicks,
    impressions: adsRow.impressions,
    conversions: adsRow.conversions,
    ctr_percent: adsRow.ctr_percent,
    cpc: adsRow.cpc,
    cpm: adsRow.cpm,
    conversion_rate: adsRow.conversion_rate,
    subscriptions,
    trials_approved,
    trials,
    customers,
    ots,
    ots_approved,
    upsells,
    upsells_approved,
    on_hold,
    approval_rate: subscriptions > 0 ? trials_approved / subscriptions : 0,
    ots_approval_rate: ots > 0 ? ots_approved / ots : 0,
    upsell_approval_rate: upsells > 0 ? upsells_approved / upsells : 0,
    real_cpa: trials_approved > 0 ? adsRow.cost / trials_approved : 0,
  };
}

/**
 * Compute source-level totals from source CRM data, filtered by a set of networks.
 * Used to calculate the "Unknown" row gap at tracking-level dimensions.
 */
export function computeSourceTotals(
  subIndex: Map<string, SourceSubscriptionRow[]>,
  otsIndex: Map<string, SourceOtsRow[]>,
  trialIndex: Map<string, SourceTrialRow[]>,
  networks: Set<string>
): {
  subscriptions: number; customers: number; upsells: number; upsells_approved: number;
  ots: number; ots_approved: number; trials: number; trials_approved: number; on_hold: number;
} {
  let subscriptions = 0, customers = 0, upsells = 0, upsells_approved = 0;
  let ots = 0, ots_approved = 0;
  let trials = 0, trials_approved = 0, on_hold = 0;

  const visited = new Set<string>();
  for (const network of networks) {
    const validSources = SOURCE_MAPPING[network.toLowerCase()] || [];
    for (const src of validSources) {
      if (visited.has(src)) continue;
      visited.add(src);

      for (const r of subIndex.get(src) || []) {
        subscriptions += Number(r.subscription_count || 0);
        customers += Number(r.customer_count || 0);
        upsells += Number(r.upsell_count || 0);
        upsells_approved += Number(r.upsells_approved_count || 0);
      }
      for (const r of otsIndex.get(src) || []) {
        ots += Number(r.ots_count || 0);
        ots_approved += Number(r.ots_approved_count || 0);
      }
      for (const r of trialIndex.get(src) || []) {
        trials += Number(r.trial_count || 0);
        trials_approved += Number(r.trials_approved_count || 0);
        on_hold += Number(r.on_hold_count || 0);
      }
    }
  }

  return { subscriptions, customers, upsells, upsells_approved, ots, ots_approved, trials, trials_approved, on_hold };
}

// ---------------------------------------------------------------------------
// Source+Country matching (for country dimension)
// ---------------------------------------------------------------------------

/** Build an index keyed by `country|source` from rows with both fields */
export function buildSourceCountryIndex<T extends { source: string | null; country: string }>(
  rows: T[]
): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${(row.country || '').toLowerCase()}|${(row.source || '').toLowerCase()}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push(row);
  }
  return index;
}

/**
 * Match a single ads row to source+country CRM data.
 * Maps PG country_code (e.g. 'DK') to CRM country name (e.g. 'denmark'),
 * then looks up by country|source for accurate per-country totals.
 *
 * @param countryCode - Override PG country code. When omitted, uses adsRow.dimension_value.
 *   Pass this when the country comes from a parent filter (e.g. expanding DK → Network).
 */
export function matchAdsToCrmBySourceCountry(
  adsRow: AdsRowInput,
  subIndex: Map<string, SourceCountrySubscriptionRow[]>,
  otsIndex: Map<string, SourceCountryOtsRow[]>,
  trialIndex: Map<string, SourceCountryTrialRow[]>,
  countryCode?: string
): AggregatedMetrics {
  let subscriptions = 0, customers = 0, upsells = 0, upsells_approved = 0;
  let ots = 0, ots_approved = 0;
  let trials = 0, trials_approved = 0, on_hold = 0;

  const code = countryCode || adsRow.dimension_value;
  const crmCountry = COUNTRY_CODE_TO_CRM[code] || code.toLowerCase();

  const visited = new Set<string>();
  for (const network of adsRow.networks) {
    const validSources = SOURCE_MAPPING[network.toLowerCase()] || [];
    for (const src of validSources) {
      const lookupKey = `${crmCountry}|${src}`;
      if (visited.has(lookupKey)) continue;
      visited.add(lookupKey);

      for (const r of subIndex.get(lookupKey) || []) {
        subscriptions += Number(r.subscription_count || 0);
        customers += Number(r.customer_count || 0);
        upsells += Number(r.upsell_count || 0);
        upsells_approved += Number(r.upsells_approved_count || 0);
      }
      for (const r of otsIndex.get(lookupKey) || []) {
        ots += Number(r.ots_count || 0);
        ots_approved += Number(r.ots_approved_count || 0);
      }
      for (const r of trialIndex.get(lookupKey) || []) {
        trials += Number(r.trial_count || 0);
        trials_approved += Number(r.trials_approved_count || 0);
        on_hold += Number(r.on_hold_count || 0);
      }
    }
  }

  return {
    dimension_value: adsRow.dimension_value,
    cost: adsRow.cost,
    clicks: adsRow.clicks,
    impressions: adsRow.impressions,
    conversions: adsRow.conversions,
    ctr_percent: adsRow.ctr_percent,
    cpc: adsRow.cpc,
    cpm: adsRow.cpm,
    conversion_rate: adsRow.conversion_rate,
    subscriptions,
    trials_approved,
    trials,
    customers,
    ots,
    ots_approved,
    upsells,
    upsells_approved,
    on_hold,
    approval_rate: subscriptions > 0 ? trials_approved / subscriptions : 0,
    ots_approval_rate: ots > 0 ? ots_approved / ots : 0,
    upsell_approval_rate: upsells > 0 ? upsells_approved / upsells : 0,
    real_cpa: trials_approved > 0 ? adsRow.cost / trials_approved : 0,
  };
}
