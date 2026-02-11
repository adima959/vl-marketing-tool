import { buildCrmIndex, buildOtsIndex, matchAdsToCrm } from '@/lib/server/marketingTransforms';
import type { CRMSubscriptionRow, CRMOtsRow } from '@/lib/server/crmQueryBuilder';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeCrmRow(overrides: Partial<CRMSubscriptionRow> = {}): CRMSubscriptionRow {
  return {
    source: 'adwords',
    campaign_id: 'c1',
    adset_id: 'as1',
    ad_id: 'a1',
    date: '2026-01-01',
    customer_count: 3,
    subscription_count: 10,
    trial_count: 8,
    trials_approved_count: 7,
    upsell_count: 2,
    upsells_approved_count: 1,
    ...overrides,
  };
}

function makeOtsRow(overrides: Partial<CRMOtsRow> = {}): CRMOtsRow {
  return {
    source: 'adwords',
    campaign_id: 'c1',
    adset_id: 'as1',
    ad_id: 'a1',
    date: '2026-01-01',
    ots_count: 5,
    ots_approved_count: 3,
    ...overrides,
  };
}

function makeAdsRow(overrides: Partial<Parameters<typeof matchAdsToCrm>[0]> = {}): Parameters<typeof matchAdsToCrm>[0] {
  return {
    campaign_ids: ['c1'],
    adset_ids: ['as1'],
    ad_ids: ['a1'],
    networks: ['Google Ads'],
    cost: 100,
    clicks: 50,
    impressions: 1000,
    conversions: 5,
    ctr_percent: 0.05,
    cpc: 2,
    cpm: 100,
    conversion_rate: 0.005,
    dimension_value: 'test-campaign',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildCrmIndex
// ---------------------------------------------------------------------------

describe('buildCrmIndex', () => {
  it('groups rows by campaign|adset|ad key', () => {
    const rows = [
      makeCrmRow({ campaign_id: 'c1', adset_id: 'as1', ad_id: 'a1' }),
      makeCrmRow({ campaign_id: 'c2', adset_id: 'as2', ad_id: 'a2' }),
    ];
    const index = buildCrmIndex(rows);

    expect(index.size).toBe(2);
    expect(index.has('c1|as1|a1')).toBe(true);
    expect(index.has('c2|as2|a2')).toBe(true);
    expect(index.get('c1|as1|a1')).toHaveLength(1);
    expect(index.get('c2|as2|a2')).toHaveLength(1);
  });

  it('accumulates multiple rows with the same key', () => {
    const rows = [
      makeCrmRow({ campaign_id: 'c1', adset_id: 'as1', ad_id: 'a1', date: '2026-01-01' }),
      makeCrmRow({ campaign_id: 'c1', adset_id: 'as1', ad_id: 'a1', date: '2026-01-02' }),
      makeCrmRow({ campaign_id: 'c1', adset_id: 'as1', ad_id: 'a1', date: '2026-01-03' }),
    ];
    const index = buildCrmIndex(rows);

    expect(index.size).toBe(1);
    expect(index.get('c1|as1|a1')).toHaveLength(3);
  });

  it('returns empty map for empty input', () => {
    const index = buildCrmIndex([]);
    expect(index.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildOtsIndex
// ---------------------------------------------------------------------------

describe('buildOtsIndex', () => {
  it('groups rows by campaign|adset|ad key', () => {
    const rows = [
      makeOtsRow({ campaign_id: 'c1', adset_id: 'as1', ad_id: 'a1' }),
      makeOtsRow({ campaign_id: 'c2', adset_id: 'as2', ad_id: 'a2' }),
    ];
    const index = buildOtsIndex(rows);

    expect(index.size).toBe(2);
    expect(index.has('c1|as1|a1')).toBe(true);
    expect(index.has('c2|as2|a2')).toBe(true);
  });

  it('accumulates multiple rows with the same key', () => {
    const rows = [
      makeOtsRow({ campaign_id: 'c1', adset_id: 'as1', ad_id: 'a1', date: '2026-01-01' }),
      makeOtsRow({ campaign_id: 'c1', adset_id: 'as1', ad_id: 'a1', date: '2026-01-02' }),
    ];
    const index = buildOtsIndex(rows);

    expect(index.size).toBe(1);
    expect(index.get('c1|as1|a1')).toHaveLength(2);
  });

  it('returns empty map for empty input', () => {
    const index = buildOtsIndex([]);
    expect(index.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// matchAdsToCrm
// ---------------------------------------------------------------------------

describe('matchAdsToCrm', () => {
  it('populates CRM metrics when source matches', () => {
    const crmIndex = buildCrmIndex([makeCrmRow()]);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow();

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.subscriptions).toBe(10);
    expect(result.trials_approved).toBe(7);
    expect(result.trials).toBe(8);
    expect(result.customers).toBe(3);
    expect(result.upsells).toBe(2);
    expect(result.upsells_approved).toBe(1);
    // Ad metrics pass through
    expect(result.cost).toBe(100);
    expect(result.clicks).toBe(50);
    expect(result.dimension_value).toBe('test-campaign');
  });

  it('returns zeros when source does not match', () => {
    const crmIndex = buildCrmIndex([makeCrmRow({ source: 'bing' })]);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow({ networks: ['Google Ads'] });

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.subscriptions).toBe(0);
    expect(result.trials_approved).toBe(0);
    expect(result.trials).toBe(0);
    expect(result.customers).toBe(0);
    expect(result.approval_rate).toBe(0);
  });

  it('sums across multiple campaign x adset x ad combos', () => {
    const crmRows = [
      makeCrmRow({ campaign_id: 'c1', adset_id: 'as1', ad_id: 'a1', subscription_count: 5 }),
      makeCrmRow({ campaign_id: 'c1', adset_id: 'as2', ad_id: 'a1', subscription_count: 3 }),
      makeCrmRow({ campaign_id: 'c2', adset_id: 'as1', ad_id: 'a1', subscription_count: 4 }),
      makeCrmRow({ campaign_id: 'c2', adset_id: 'as2', ad_id: 'a1', subscription_count: 6 }),
    ];
    const crmIndex = buildCrmIndex(crmRows);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow({
      campaign_ids: ['c1', 'c2'],
      adset_ids: ['as1', 'as2'],
      ad_ids: ['a1'],
    });

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.subscriptions).toBe(5 + 3 + 4 + 6);
  });

  it('calculates approval_rate = trials_approved / subscriptions', () => {
    const crmIndex = buildCrmIndex([
      makeCrmRow({ subscription_count: 10, trials_approved_count: 7 }),
    ]);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow();

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.approval_rate).toBe(0.7);
  });

  it('returns approval_rate 0 when subscriptions is 0', () => {
    const crmIndex = buildCrmIndex([]);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow();

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.approval_rate).toBe(0);
    expect(result.subscriptions).toBe(0);
  });

  it('matches OTS data separately from CRM subscriptions', () => {
    const crmIndex = buildCrmIndex([]);
    const otsIndex = buildOtsIndex([
      makeOtsRow({ ots_count: 12, ots_approved_count: 9 }),
    ]);
    const adsRow = makeAdsRow();

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.ots).toBe(12);
    expect(result.ots_approved).toBe(9);
    expect(result.ots_approval_rate).toBe(9 / 12);
    // CRM metrics remain 0
    expect(result.subscriptions).toBe(0);
  });

  it('calculates real_cpa = cost / trials_approved', () => {
    const crmIndex = buildCrmIndex([
      makeCrmRow({ trials_approved_count: 5 }),
    ]);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow({ cost: 100 });

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.real_cpa).toBe(20);
  });

  it('returns real_cpa 0 when trials_approved is 0', () => {
    const crmIndex = buildCrmIndex([
      makeCrmRow({ trials_approved_count: 0 }),
    ]);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow({ cost: 100 });

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.real_cpa).toBe(0);
  });

  it('matches Facebook network to facebook/meta/fb sources', () => {
    const crmIndex = buildCrmIndex([
      makeCrmRow({ source: 'facebook', subscription_count: 5 }),
    ]);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow({ networks: ['Facebook'] });

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.subscriptions).toBe(5);
  });

  it('calculates upsell_approval_rate correctly', () => {
    const crmIndex = buildCrmIndex([
      makeCrmRow({ upsell_count: 10, upsells_approved_count: 4 }),
    ]);
    const otsIndex = buildOtsIndex([]);
    const adsRow = makeAdsRow();

    const result = matchAdsToCrm(adsRow, crmIndex, otsIndex);

    expect(result.upsell_approval_rate).toBe(0.4);
  });
});
