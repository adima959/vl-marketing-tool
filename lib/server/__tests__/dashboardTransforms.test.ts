import {
  buildOtsMap,
  transformDashboardRow,
  buildOtsOnlyRows,
} from '@/lib/server/dashboardTransforms';

// ---------------------------------------------------------------------------
// buildOtsMap
// ---------------------------------------------------------------------------

describe('buildOtsMap', () => {
  it('maps OTS rows correctly by toTitleCase key', () => {
    const otsRows = [
      { country: 'DENMARK', ots_count: '5', ots_approved_count: '3' },
      { country: 'SWEDEN', ots_count: '10', ots_approved_count: '8' },
    ];

    const result = buildOtsMap(otsRows, 'country', '');

    expect(result.size).toBe(2);
    expect(result.get('Denmark')).toEqual({ ots: 5, otsApproved: 3 });
    expect(result.get('Sweden')).toEqual({ ots: 10, otsApproved: 8 });
  });

  it('handles missing column value as Unknown', () => {
    const otsRows = [
      { country: null, ots_count: '2', ots_approved_count: '1' },
      { country: undefined, ots_count: '4', ots_approved_count: '0' },
    ];

    const result = buildOtsMap(otsRows, 'country', '');

    // Both map to "Unknown" — second overwrites first
    expect(result.size).toBe(1);
    expect(result.get('Unknown')).toEqual({ ots: 4, otsApproved: 0 });
  });

  it('applies keyPrefix correctly', () => {
    const otsRows = [
      { country: 'NORWAY', ots_count: '7', ots_approved_count: '5' },
    ];

    const result = buildOtsMap(otsRows, 'country', 'Denmark::');

    expect(result.size).toBe(1);
    expect(result.has('Denmark::Norway')).toBe(true);
    expect(result.get('Denmark::Norway')).toEqual({ ots: 7, otsApproved: 5 });
  });

  it('handles non-numeric ots values as 0', () => {
    const otsRows = [
      { country: 'FINLAND', ots_count: 'abc', ots_approved_count: '' },
    ];

    const result = buildOtsMap(otsRows, 'country', '');

    expect(result.get('Finland')).toEqual({ ots: 0, otsApproved: 0 });
  });

  it('returns empty map for empty input', () => {
    const result = buildOtsMap([], 'country', '');
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// transformDashboardRow
// ---------------------------------------------------------------------------

describe('transformDashboardRow', () => {
  const emptyOtsMap = new Map<string, { ots: number; otsApproved: number }>();

  function makeRow(overrides: Record<string, any> = {}): Record<string, any> {
    return {
      country: 'DENMARK',
      customer_count: '15',
      subscription_count: '10',
      trial_count: '8',
      trials_approved_count: '7',
      upsell_count: '3',
      upsells_approved_count: '2',
      ...overrides,
    };
  }

  it('computes approvalRate as trialsApproved / subscriptions', () => {
    const row = makeRow({ subscription_count: '10', trials_approved_count: '7' });

    const { dashboardRow } = transformDashboardRow(row, emptyOtsMap, 'country', '', 0, true);

    // Critical formula: 7 / 10 = 0.7 exactly
    expect(dashboardRow.metrics.approvalRate).toBe(0.7);
  });

  it('returns approvalRate 0 when subscriptions = 0', () => {
    const row = makeRow({ subscription_count: '0', trials_approved_count: '5' });

    const { dashboardRow } = transformDashboardRow(row, emptyOtsMap, 'country', '', 0, true);

    expect(dashboardRow.metrics.approvalRate).toBe(0);
  });

  it('merges OTS data when key exists in map', () => {
    const otsMap = new Map([
      ['Denmark', { ots: 12, otsApproved: 9 }],
    ]);

    const row = makeRow();
    const { dashboardRow } = transformDashboardRow(row, otsMap, 'country', '', 0, true);

    expect(dashboardRow.metrics.ots).toBe(12);
    expect(dashboardRow.metrics.otsApproved).toBe(9);
    expect(dashboardRow.metrics.otsApprovalRate).toBe(9 / 12);
  });

  it('returns zeros for OTS when key not in map', () => {
    const row = makeRow();
    const { dashboardRow } = transformDashboardRow(row, emptyOtsMap, 'country', '', 0, true);

    expect(dashboardRow.metrics.ots).toBe(0);
    expect(dashboardRow.metrics.otsApproved).toBe(0);
    expect(dashboardRow.metrics.otsApprovalRate).toBe(0);
  });

  it('computes otsApprovalRate as otsApproved / ots', () => {
    const otsMap = new Map([
      ['Denmark', { ots: 20, otsApproved: 15 }],
    ]);

    const row = makeRow();
    const { dashboardRow } = transformDashboardRow(row, otsMap, 'country', '', 0, true);

    expect(dashboardRow.metrics.otsApprovalRate).toBe(15 / 20);
  });

  it('computes upsellApprovalRate correctly', () => {
    const row = makeRow({ upsell_count: '4', upsells_approved_count: '3' });

    const { dashboardRow } = transformDashboardRow(row, emptyOtsMap, 'country', '', 0, true);

    expect(dashboardRow.metrics.upsellApprovalRate).toBe(3 / 4);
  });

  it('returns upsellApprovalRate 0 when upsells = 0', () => {
    const row = makeRow({ upsell_count: '0', upsells_approved_count: '0' });

    const { dashboardRow } = transformDashboardRow(row, emptyOtsMap, 'country', '', 0, true);

    expect(dashboardRow.metrics.upsellApprovalRate).toBe(0);
  });

  it('sets depth and hasChildren from parameters', () => {
    const row = makeRow();

    const { dashboardRow: row0 } = transformDashboardRow(row, emptyOtsMap, 'country', '', 0, true);
    expect(row0.depth).toBe(0);
    expect(row0.hasChildren).toBe(true);

    const { dashboardRow: row2 } = transformDashboardRow(row, emptyOtsMap, 'country', '', 2, false);
    expect(row2.depth).toBe(2);
    expect(row2.hasChildren).toBe(false);
  });

  it('builds correct key and attribute with prefix', () => {
    const row = makeRow({ country: 'SWEDEN' });

    const { dashboardRow, otsKey } = transformDashboardRow(
      row, emptyOtsMap, 'country', 'Denmark::', 1, true
    );

    expect(dashboardRow.key).toBe('Denmark::Sweden');
    expect(dashboardRow.attribute).toBe('Sweden');
    expect(otsKey).toBe('Denmark::Sweden');
  });

  it('uses Unknown for missing column value', () => {
    const row = makeRow({ country: null });

    const { dashboardRow } = transformDashboardRow(row, emptyOtsMap, 'country', '', 0, true);

    expect(dashboardRow.attribute).toBe('Unknown');
    expect(dashboardRow.key).toBe('Unknown');
  });
});

// ---------------------------------------------------------------------------
// buildOtsOnlyRows
// ---------------------------------------------------------------------------

describe('buildOtsOnlyRows', () => {
  it('skips matched keys', () => {
    const otsMap = new Map([
      ['Denmark', { ots: 5, otsApproved: 3 }],
      ['Sweden', { ots: 8, otsApproved: 6 }],
    ]);
    const matchedKeys = new Set(['Denmark']);

    const rows = buildOtsOnlyRows(otsMap, matchedKeys, '', 0, true);

    expect(rows).toHaveLength(1);
    expect(rows[0].attribute).toBe('Sweden');
  });

  it('returns empty array when all keys matched', () => {
    const otsMap = new Map([
      ['Denmark', { ots: 5, otsApproved: 3 }],
    ]);
    const matchedKeys = new Set(['Denmark']);

    const rows = buildOtsOnlyRows(otsMap, matchedKeys, '', 0, true);

    expect(rows).toHaveLength(0);
  });

  it('returns rows with zero subscription metrics', () => {
    const otsMap = new Map([
      ['Norway', { ots: 10, otsApproved: 7 }],
    ]);
    const matchedKeys = new Set<string>();

    const rows = buildOtsOnlyRows(otsMap, matchedKeys, '', 0, true);

    expect(rows).toHaveLength(1);
    const metrics = rows[0].metrics;
    expect(metrics.customers).toBe(0);
    expect(metrics.subscriptions).toBe(0);
    expect(metrics.trials).toBe(0);
    expect(metrics.trialsApproved).toBe(0);
    expect(metrics.upsells).toBe(0);
    expect(metrics.upsellsApproved).toBe(0);
    expect(metrics.upsellApprovalRate).toBe(0);
  });

  it('sets approvalRate for OTS-only rows as otsApproved / ots', () => {
    const otsMap = new Map([
      ['Finland', { ots: 20, otsApproved: 14 }],
    ]);
    const matchedKeys = new Set<string>();

    const rows = buildOtsOnlyRows(otsMap, matchedKeys, '', 0, false);

    // approvalRate = 14 / 20 = 0.7 exactly
    expect(rows[0].metrics.approvalRate).toBe(0.7);
    expect(rows[0].metrics.otsApprovalRate).toBe(0.7);
  });

  it('sets approvalRate 0 when ots = 0', () => {
    const otsMap = new Map([
      ['Empty', { ots: 0, otsApproved: 0 }],
    ]);
    const matchedKeys = new Set<string>();

    const rows = buildOtsOnlyRows(otsMap, matchedKeys, '', 0, false);

    expect(rows[0].metrics.approvalRate).toBe(0);
    expect(rows[0].metrics.otsApprovalRate).toBe(0);
  });

  it('strips keyPrefix from attribute', () => {
    const otsMap = new Map([
      ['Denmark::T-Formula', { ots: 5, otsApproved: 2 }],
    ]);
    const matchedKeys = new Set<string>();

    const rows = buildOtsOnlyRows(otsMap, matchedKeys, 'Denmark::', 1, true);

    expect(rows[0].key).toBe('Denmark::T-Formula');
    expect(rows[0].attribute).toBe('T-Formula');
    expect(rows[0].depth).toBe(1);
    expect(rows[0].hasChildren).toBe(true);
  });

  it('populates OTS metrics correctly', () => {
    const otsMap = new Map([
      ['Iceland', { ots: 15, otsApproved: 11 }],
    ]);
    const matchedKeys = new Set<string>();

    const rows = buildOtsOnlyRows(otsMap, matchedKeys, '', 0, false);

    expect(rows[0].metrics.ots).toBe(15);
    expect(rows[0].metrics.otsApproved).toBe(11);
  });
});
