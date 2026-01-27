/**
 * Tree traversal utilities for hierarchical report data
 */

interface TreeRow {
  key: string;
  children?: TreeRow[];
}

/**
 * Recursively finds a row in the tree by its key
 * @param rows Array of rows to search
 * @param targetKey Key to find
 * @returns Found row or null
 */
export function findRowByKey<T extends TreeRow>(
  rows: T[],
  targetKey: string
): T | null {
  for (const row of rows) {
    if (row.key === targetKey) {
      return row;
    }
    if (row.children) {
      const found = findRowByKey(row.children as T[], targetKey);
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
