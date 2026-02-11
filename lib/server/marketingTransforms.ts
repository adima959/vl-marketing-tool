import type { CRMSubscriptionRow, CRMOtsRow } from './crmQueryBuilder';
import type { AggregatedMetrics } from './marketingQueryBuilder';
import { matchNetworkToSource } from './crmMetrics';

/**
 * Pure transform functions extracted from marketingQueryBuilder.
 * These handle the JavaScript-side matching of PostgreSQL ads data
 * to MariaDB CRM data via tracking ID tuples (campaign|adset|ad).
 *
 * All functions are side-effect-free and independently testable.
 */

/**
 * Build an index of CRM subscription rows keyed by tracking ID tuple.
 * Key format: `${campaign_id}|${adset_id}|${ad_id}`
 */
export function buildCrmIndex(
  crmData: CRMSubscriptionRow[]
): Map<string, CRMSubscriptionRow[]> {
  const index = new Map<string, CRMSubscriptionRow[]>();
  for (const crm of crmData) {
    const key = `${crm.campaign_id}|${crm.adset_id}|${crm.ad_id}`;
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(crm);
  }
  return index;
}

/**
 * Build an index of OTS rows keyed by tracking ID tuple.
 * Key format: `${campaign_id}|${adset_id}|${ad_id}`
 */
export function buildOtsIndex(
  otsData: CRMOtsRow[]
): Map<string, CRMOtsRow[]> {
  const index = new Map<string, CRMOtsRow[]>();
  for (const ots of otsData) {
    const key = `${ots.campaign_id}|${ots.adset_id}|${ots.ad_id}`;
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(ots);
  }
  return index;
}

/**
 * Match a single ads row to CRM and OTS data via tracking ID cross-join.
 *
 * For each combination of campaign_id x adset_id x ad_id, looks up matching
 * CRM subscription rows and OTS rows, verifying that the ad network matches
 * the CRM source (e.g., 'Google Ads' -> 'adwords').
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
  crmIndex: Map<string, CRMSubscriptionRow[]>,
  otsIndex: Map<string, CRMOtsRow[]>
): AggregatedMetrics {
  let subscriptions = 0;
  let trials_approved = 0;
  let trials = 0;
  let customers = 0;
  let upsells = 0;
  let upsells_approved = 0;
  let ots = 0;
  let ots_approved = 0;

  for (const campaignId of adsRow.campaign_ids) {
    for (const adsetId of adsRow.adset_ids) {
      for (const adId of adsRow.ad_ids) {
        const key = `${campaignId}|${adsetId}|${adId}`;

        const crmRows = crmIndex.get(key);
        if (crmRows) {
          for (const crm of crmRows) {
            const sourceMatched = adsRow.networks.some(n => matchNetworkToSource(n, crm.source));
            if (sourceMatched) {
              subscriptions += Number(crm.subscription_count || 0);
              trials_approved += Number(crm.trials_approved_count || 0);
              trials += Number(crm.trial_count || 0);
              customers += Number(crm.customer_count || 0);
              upsells += Number(crm.upsell_count || 0);
              upsells_approved += Number(crm.upsells_approved_count || 0);
            }
          }
        }

        const otsRows = otsIndex.get(key);
        if (otsRows) {
          for (const otsRow of otsRows) {
            const sourceMatched = adsRow.networks.some(n => matchNetworkToSource(n, otsRow.source));
            if (sourceMatched) {
              ots += Number(otsRow.ots_count || 0);
              ots_approved += Number(otsRow.ots_approved_count || 0);
            }
          }
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
    approval_rate: subscriptions > 0 ? trials_approved / subscriptions : 0,
    ots_approval_rate: ots > 0 ? ots_approved / ots : 0,
    upsell_approval_rate: upsells > 0 ? upsells_approved / upsells : 0,
    real_cpa: trials_approved > 0 ? adsRow.cost / trials_approved : 0,
  };
}
