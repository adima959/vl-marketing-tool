import type { ReportRow } from '@/types';

/**
 * Tree traversal utilities for hierarchical report data
 */

/**
 * Recursively finds a row in the tree by its key
 * @param rows Array of rows to search
 * @param targetKey Key to find
 * @returns Found row or null
 */
export function findRowByKey(
  rows: ReportRow[],
  targetKey: string
): ReportRow | null {
  for (const row of rows) {
    if (row.key === targetKey) {
      return row;
    }
    if (row.children) {
      const found = findRowByKey(row.children, targetKey);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Calculates the depth of a row based on its key
 * (counts the number of '::' separators)
 */
export function getDepthFromKey(key: string): number {
  return (key.match(/::/g) || []).length;
}

/**
 * Sorts keys by depth (for parent-first loading)
 */
export function sortKeysByDepth(keys: string[]): string[] {
  return keys.sort((a, b) => {
    const depthA = getDepthFromKey(a);
    const depthB = getDepthFromKey(b);
    return depthA - depthB;
  });
}

/**
 * Builds parent filters from a row key by parsing its hierarchy
 * Example: "network::campaign::adset" => { network: "network", campaign: "campaign" }
 */
export function buildParentFiltersFromKey(
  key: string,
  dimensions: string[]
): Record<string, string> {
  const parts = key.split('::');
  const filters: Record<string, string> = {};

  parts.slice(0, -1).forEach((value, index) => {
    const dimension = dimensions[index];
    if (dimension) {
      filters[dimension] = value;
    }
  });

  return filters;
}
