import {
  updateHasChildren,
  updateTreeChildren,
  updateTreeWithResults,
  parseKeyToParentFilters,
  groupKeysByDepth,
} from '@/lib/utils/treeUtils';

// Minimal row type satisfying the TreeRow constraint
interface TestRow {
  key: string;
  depth: number;
  hasChildren?: boolean;
  children?: TestRow[];
}

function makeRow(key: string, depth: number, hasChildren?: boolean, children?: TestRow[]): TestRow {
  return { key, depth, hasChildren, children };
}

// ── updateHasChildren ──────────────────────────────────────────────

describe('updateHasChildren', () => {
  it('sets hasChildren = true when depth < dimensionCount - 1', () => {
    const rows = [makeRow('US', 0, false)];
    const result = updateHasChildren(rows, 2);
    expect(result[0].hasChildren).toBe(true);
  });

  it('sets hasChildren = false when depth equals dimensionCount - 1', () => {
    const rows = [makeRow('US::Google', 1, true)];
    const result = updateHasChildren(rows, 2);
    expect(result[0].hasChildren).toBe(false);
  });

  it('recursively updates children', () => {
    const rows = [
      makeRow('US', 0, false, [
        makeRow('US::Google', 1, true),
      ]),
    ];
    const result = updateHasChildren(rows, 3);
    expect(result[0].hasChildren).toBe(true);     // depth 0 < 2
    expect(result[0].children![0].hasChildren).toBe(true); // depth 1 < 2
  });

  it('returns new objects (immutability)', () => {
    const child = makeRow('US::Google', 1, false);
    const rows = [makeRow('US', 0, false, [child])];
    const result = updateHasChildren(rows, 2);

    expect(result[0]).not.toBe(rows[0]);
    expect(result[0].children![0]).not.toBe(child);
  });
});

// ── updateTreeChildren ─────────────────────────────────────────────

describe('updateTreeChildren', () => {
  it('sets children on matching key at root level', () => {
    const rows = [makeRow('US', 0), makeRow('DE', 0)];
    const newChildren = [makeRow('US::Google', 1)];
    const result = updateTreeChildren(rows, 'US', newChildren);

    expect(result[0].children).toEqual(newChildren);
    expect(result[1].children).toBeUndefined();
  });

  it('finds key in nested children', () => {
    const rows = [
      makeRow('US', 0, true, [
        makeRow('US::Google', 1),
      ]),
    ];
    const newChildren = [makeRow('US::Google::P1', 2)];
    const result = updateTreeChildren(rows, 'US::Google', newChildren);

    expect(result[0].children![0].children).toEqual(newChildren);
  });

  it('returns rows unchanged when key does not match', () => {
    const rows = [makeRow('US', 0), makeRow('DE', 0)];
    const result = updateTreeChildren(rows, 'FR', [makeRow('FR::Google', 1)]);

    expect(result[0].children).toBeUndefined();
    expect(result[1].children).toBeUndefined();
  });

  it('returns new objects (immutability)', () => {
    const original = makeRow('US', 0);
    const rows = [original];
    const result = updateTreeChildren(rows, 'US', [makeRow('US::Google', 1)]);

    expect(result[0]).not.toBe(original);
  });
});

// ── updateTreeWithResults ──────────────────────────────────────────

describe('updateTreeWithResults', () => {
  it('sets children from fulfilled result with matching key', () => {
    const rows = [makeRow('US', 0), makeRow('DE', 0)];
    const children = [makeRow('US::Google', 1)];
    const results: PromiseSettledResult<{ success: boolean; key: string; children: TestRow[] }>[] = [
      { status: 'fulfilled', value: { success: true, key: 'US', children } },
    ];

    const result = updateTreeWithResults(rows, results);
    expect(result[0].children).toEqual(children);
    expect(result[1].children).toBeUndefined();
  });

  it('ignores rejected results', () => {
    const rows = [makeRow('US', 0)];
    const results: PromiseSettledResult<{ success: boolean; key: string; children: TestRow[] }>[] = [
      { status: 'rejected', reason: new Error('fail') },
    ];

    const result = updateTreeWithResults(rows, results);
    expect(result[0].children).toBeUndefined();
  });

  it('matches multiple results to different rows', () => {
    const rows = [makeRow('US', 0), makeRow('DE', 0)];
    const usChildren = [makeRow('US::Google', 1)];
    const deChildren = [makeRow('DE::Bing', 1)];
    const results: PromiseSettledResult<{ success: boolean; key: string; children: TestRow[] }>[] = [
      { status: 'fulfilled', value: { success: true, key: 'US', children: usChildren } },
      { status: 'fulfilled', value: { success: true, key: 'DE', children: deChildren } },
    ];

    const result = updateTreeWithResults(rows, results);
    expect(result[0].children).toEqual(usChildren);
    expect(result[1].children).toEqual(deChildren);
  });

  it('ignores fulfilled results where success is false', () => {
    const rows = [makeRow('US', 0)];
    const results: PromiseSettledResult<{ success: boolean; key: string; children: TestRow[] }>[] = [
      { status: 'fulfilled', value: { success: false, key: 'US', children: [] } },
    ];

    const result = updateTreeWithResults(rows, results);
    expect(result[0].children).toBeUndefined();
  });
});

// ── parseKeyToParentFilters ────────────────────────────────────────

describe('parseKeyToParentFilters', () => {
  it('maps a simple key to a single dimension', () => {
    expect(parseKeyToParentFilters('US', ['country'])).toEqual({ country: 'US' });
  });

  it('maps a compound key to multiple dimensions', () => {
    expect(parseKeyToParentFilters('US::Google', ['country', 'source'])).toEqual({
      country: 'US',
      source: 'Google',
    });
  });

  it('ignores extra key parts beyond available dimensions', () => {
    expect(parseKeyToParentFilters('US::Google::Extra', ['country'])).toEqual({
      country: 'US',
    });
  });
});

// ── groupKeysByDepth ───────────────────────────────────────────────

describe('groupKeysByDepth', () => {
  it('groups single-segment keys at depth 0', () => {
    const result = groupKeysByDepth(['US', 'DE']);
    expect(result.get(0)).toEqual(['US', 'DE']);
    expect(result.size).toBe(1);
  });

  it('calculates depth from :: separator count', () => {
    const result = groupKeysByDepth(['US::Google::P1']);
    expect(result.get(2)).toEqual(['US::Google::P1']);
  });

  it('groups mixed depths correctly', () => {
    const result = groupKeysByDepth(['US', 'US::Google', 'DE', 'DE::Bing::P1']);
    expect(result.get(0)).toEqual(['US', 'DE']);
    expect(result.get(1)).toEqual(['US::Google']);
    expect(result.get(2)).toEqual(['DE::Bing::P1']);
  });
});
