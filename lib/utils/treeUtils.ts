/**
 * Shared tree utility functions for hierarchical table stores.
 *
 * Extracted from createTableStore and validationRateStoreFactory
 * to eliminate duplication of common tree traversal/update patterns.
 */

/**
 * Minimal row shape that both BaseTableRow and ValidationRateRow satisfy.
 * Uses readonly arrays and optional children to stay compatible with
 * concrete types where children is typed as `ConcreteRow[]` rather than `TRow[]`.
 */
export interface TreeRow {
  key: string;
  depth: number;
  hasChildren?: boolean;
  children?: TreeRow[];
}

interface TreeResult<TRow> {
  success: boolean;
  key: string;
  children: TRow[];
}

/**
 * Update hasChildren for all rows based on dimension count.
 * Called when dimensions are added or removed so the expand icon stays accurate.
 * Returns a new array (immutable).
 */
export function updateHasChildren<TRow extends TreeRow>(
  rows: TRow[],
  dimensionCount: number
): TRow[] {
  return rows.map(row => {
    const newHasChildren = row.depth < dimensionCount - 1;
    const updatedRow = { ...row, hasChildren: newHasChildren };

    if (row.children && row.children.length > 0) {
      updatedRow.children = updateHasChildren(row.children, dimensionCount);
    }

    return updatedRow;
  });
}

/**
 * Set children on a specific row found by key, searching recursively.
 * Used by loadChildData to attach freshly-fetched children to the correct parent.
 * Returns a new array (immutable).
 */
export function updateTreeChildren<TRow extends TreeRow>(
  rows: TRow[],
  parentKey: string,
  children: TRow[]
): TRow[] {
  return rows.map(row => {
    if (row.key === parentKey) {
      return { ...row, children };
    }
    if (row.children && row.children.length > 0) {
      return { ...row, children: updateTreeChildren(row.children, parentKey, children) };
    }
    return row;
  });
}

/**
 * Merge batch-loaded children into the tree based on Promise.allSettled results.
 * Only fulfilled, successful results are applied. Recursively searches nested children.
 * Returns a new array (immutable).
 */
export function updateTreeWithResults<TRow extends TreeRow>(
  rows: TRow[],
  results: PromiseSettledResult<TreeResult<TRow>>[]
): TRow[] {
  return rows.map(row => {
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success && result.value.key === row.key) {
        return { ...row, children: result.value.children };
      }
    }
    if (row.children && row.children.length > 0) {
      return { ...row, children: updateTreeWithResults(row.children, results) };
    }
    return row;
  });
}

/**
 * Parse a composite key (e.g. "US::Google::ProductA") into a dimension-to-value map.
 * Key parts map 1:1 to dimensions by index. Extra parts beyond dimensions are ignored.
 */
export function parseKeyToParentFilters(
  key: string,
  dimensions: string[]
): Record<string, string> {
  const keyParts = key.split('::');
  const parentFilters: Record<string, string> = {};

  for (let i = 0; i < keyParts.length; i++) {
    const dimension = dimensions[i];
    if (dimension) {
      parentFilters[dimension] = keyParts[i];
    }
  }

  return parentFilters;
}

/**
 * Group an array of composite keys by their depth (number of '::' separators).
 * Depth 0 = single value, depth 1 = "a::b", etc.
 */
export function groupKeysByDepth(keys: string[]): Map<number, string[]> {
  const map = new Map<number, string[]>();

  for (const key of keys) {
    const depth = key.split('::').length - 1;
    if (!map.has(depth)) {
      map.set(depth, []);
    }
    map.get(depth)!.push(key);
  }

  return map;
}

/**
 * Find a row by its key, searching recursively through children.
 */
export function findRowByKey<TRow extends TreeRow>(rows: TRow[], key: string): TRow | undefined {
  for (const row of rows) {
    if (row.key === key) return row;
    if (row.children?.length) {
      const found = findRowByKey(row.children as TRow[], key);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Sort keys by depth (shallow first) so parent data loads before children.
 */
export function sortKeysByDepth(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const depthA = a.split('::').length - 1;
    const depthB = b.split('::').length - 1;
    return depthA - depthB;
  });
}

/**
 * Restore expanded rows by fetching children for each saved expanded key.
 * Processes keys depth-first (shallow before deep) so parent data exists before children load.
 */
export interface RestoreConfig<TRow extends TreeRow> {
  savedExpandedKeys: string[];
  reportData: TRow[];
  dimensions: string[];
  fetchChildren: (parentFilters: Record<string, string>, depth: number) => Promise<TRow[]>;
  skipIfChildrenExist?: boolean;
}

export async function restoreExpandedRows<TRow extends TreeRow>(
  config: RestoreConfig<TRow>
): Promise<{ updatedData: TRow[]; validKeys: string[] }> {
  const { savedExpandedKeys, dimensions, fetchChildren, skipIfChildrenExist } = config;
  let updatedData = config.reportData;
  const validKeys: string[] = [];

  const sortedKeys = sortKeysByDepth(savedExpandedKeys);

  for (const key of sortedKeys) {
    const row = findRowByKey(updatedData, key);
    if (!row) continue;

    if (skipIfChildrenExist && row.children && row.children.length > 0) {
      validKeys.push(key);
      continue;
    }

    const parentFilters = parseKeyToParentFilters(key, dimensions);
    const depth = key.split('::').length;

    try {
      const children = await fetchChildren(parentFilters, depth);
      updatedData = updateTreeChildren(updatedData, key, children as TRow[]);
      validKeys.push(key);
    } catch {
      // Skip failed fetches — row won't be expanded
    }
  }

  return { updatedData, validKeys };
}
