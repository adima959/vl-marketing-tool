import { buildTrackingKey, buildTrackingCrmMatch, buildVisitorCrmMatch } from '@/lib/server/onPageTransforms';

describe('buildTrackingKey', () => {
  it('joins all four fields with :: separator', () => {
    expect(buildTrackingKey('google', 'camp1', 'adset1', 'ad1'))
      .toBe('google::camp1::adset1::ad1');
  });

  it('normalizes literal "null" strings to empty strings', () => {
    expect(buildTrackingKey('null', 'camp1', 'null', 'ad1'))
      .toBe('::camp1::::ad1');
  });

  it('excludes source when specified', () => {
    expect(buildTrackingKey('google', 'camp1', 'adset1', 'ad1', ['source']))
      .toBe('camp1::adset1::ad1');
  });

  it('excludes multiple fields', () => {
    expect(buildTrackingKey('google', 'camp1', 'adset1', 'ad1', ['source', 'ad_id']))
      .toBe('camp1::adset1');
  });

  it('keeps empty strings as empty (does not normalize them)', () => {
    expect(buildTrackingKey('google', '', 'adset1', ''))
      .toBe('google::::adset1::');
  });
});

describe('buildTrackingCrmMatch', () => {
  it('distributes CRM data proportionally by visitor count', () => {
    const crmRows = [
      { source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', trials: 10, approved: 7 },
    ];
    const pgRows = [
      { dimension_value: 'A', source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', unique_visitors: 60 },
      { dimension_value: 'B', source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', unique_visitors: 40 },
    ];

    const result = buildTrackingCrmMatch(crmRows, pgRows, []);

    // 60% of 10 = 6 trials, 60% of 7 = 4.2 approved
    expect(result.get('a')!.trials).toBe(6);
    expect(result.get('a')!.approved).toBeCloseTo(4.2);
    // 40% of 10 = 4 trials, 40% of 7 = 2.8 approved
    expect(result.get('b')!.trials).toBe(4);
    expect(result.get('b')!.approved).toBeCloseTo(2.8);
  });

  it('sums trials and approved when multiple CRM rows share the same key', () => {
    const crmRows = [
      { source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', trials: 5, approved: 3 },
      { source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', trials: 5, approved: 4 },
    ];
    const pgRows = [
      { dimension_value: 'PageA', source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', unique_visitors: 100 },
    ];

    const result = buildTrackingCrmMatch(crmRows, pgRows, []);

    expect(result.get('pagea')!.trials).toBe(10);
    expect(result.get('pagea')!.approved).toBe(7);
  });

  it('returns empty map when no CRM data matches PG tracking keys', () => {
    const crmRows = [
      { source: 'bing', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', trials: 5, approved: 3 },
    ];
    const pgRows = [
      { dimension_value: 'A', source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', unique_visitors: 100 },
    ];

    const result = buildTrackingCrmMatch(crmRows, pgRows, []);

    expect(result.size).toBe(0);
  });

  it('maps null dimension values to "unknown" key', () => {
    const crmRows = [
      { source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', trials: 4, approved: 2 },
    ];
    const pgRows = [
      { dimension_value: null, source: 'google', campaign_id: 'c1', adset_id: 'a1', ad_id: 'x1', unique_visitors: 50 },
    ];

    const result = buildTrackingCrmMatch(crmRows, pgRows, []);

    expect(result.get('unknown')!.trials).toBe(4);
    expect(result.get('unknown')!.approved).toBe(2);
  });
});

describe('buildVisitorCrmMatch', () => {
  it('assigns full CRM data when visitor appears in a single dimension', () => {
    const crmRows = [
      { ff_vid: 'v1', trials: 1, approved: 1 },
    ];
    const pgRows = [
      { dimension_value: 'Homepage', ff_visitor_id: 'v1' },
    ];

    const result = buildVisitorCrmMatch(crmRows, pgRows);

    expect(result.get('homepage')!.trials).toBe(1);
    expect(result.get('homepage')!.approved).toBe(1);
  });

  it('splits CRM data evenly when visitor appears in multiple dimensions', () => {
    const crmRows = [
      { ff_vid: 'v1', trials: 10, approved: 6 },
    ];
    const pgRows = [
      { dimension_value: 'PageA', ff_visitor_id: 'v1' },
      { dimension_value: 'PageB', ff_visitor_id: 'v1' },
    ];

    const result = buildVisitorCrmMatch(crmRows, pgRows);

    expect(result.get('pagea')!.trials).toBe(5);
    expect(result.get('pagea')!.approved).toBe(3);
    expect(result.get('pageb')!.trials).toBe(5);
    expect(result.get('pageb')!.approved).toBe(3);
  });

  it('skips visitors not found in CRM data', () => {
    const crmRows = [
      { ff_vid: 'v1', trials: 1, approved: 1 },
    ];
    const pgRows = [
      { dimension_value: 'PageA', ff_visitor_id: 'v1' },
      { dimension_value: 'PageA', ff_visitor_id: 'v999' },
    ];

    const result = buildVisitorCrmMatch(crmRows, pgRows);

    // Only v1 contributes; v999 is ignored
    expect(result.get('pagea')!.trials).toBe(1);
    expect(result.get('pagea')!.approved).toBe(1);
  });

  it('accumulates contributions from multiple visitors in the same dimension', () => {
    const crmRows = [
      { ff_vid: 'v1', trials: 2, approved: 1 },
      { ff_vid: 'v2', trials: 4, approved: 3 },
    ];
    const pgRows = [
      { dimension_value: 'PageA', ff_visitor_id: 'v1' },
      { dimension_value: 'PageA', ff_visitor_id: 'v2' },
    ];

    const result = buildVisitorCrmMatch(crmRows, pgRows);

    expect(result.get('pagea')!.trials).toBe(6);
    expect(result.get('pagea')!.approved).toBe(4);
  });

  it('maps null dimension values to "unknown" key', () => {
    const crmRows = [
      { ff_vid: 'v1', trials: 3, approved: 2 },
    ];
    const pgRows = [
      { dimension_value: null, ff_visitor_id: 'v1' },
    ];

    const result = buildVisitorCrmMatch(crmRows, pgRows);

    expect(result.get('unknown')!.trials).toBe(3);
    expect(result.get('unknown')!.approved).toBe(2);
  });
});
