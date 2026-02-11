/**
 * Table utility functions
 * Shared logic for DataTable components
 */

/**
 * Calculate total table width for horizontal scroll
 * @param attributeWidth - Width of the first attribute column
 * @param metricWidth - Width of each metric column
 * @param metricCount - Number of visible metric columns
 * @returns Total width in pixels
 *
 * @example
 * ```ts
 * const scrollX = calculateTableWidth(350, 110, 5); // 900px
 * <Table scroll={{ x: scrollX }} />
 * ```
 */
export function calculateTableWidth(
  attributeWidth: number,
  metricWidth: number,
  metricCount: number
): number {
  return attributeWidth + metricWidth * metricCount;
}

/**
 * Inject skeleton placeholder rows for expanded parents that are still loading children
 * Used to show loading state while fetching sub-levels in hierarchical tables
 *
 * @param rows - Array of table rows to process
 * @param expandedRowKeys - Keys of currently expanded rows
 * @param skeletonCount - Number of skeleton rows to inject per expanded parent (default: 2)
 * @returns Processed rows with skeleton placeholders injected
 *
 * @example
 * ```ts
 * const processedData = injectSkeletonRows(
 *   reportData,
 *   expandedRowKeys,
 *   2 // show 2 skeleton rows while loading
 * );
 * ```
 */
export function injectSkeletonRows<TRow extends {
  key: string;
  depth: number;
  hasChildren?: boolean;
  children?: any;
}>(
  rows: TRow[],
  expandedRowKeys: string[],
  skeletonCount: number = 2
): TRow[] {
  return rows.map((row) => {
    const isExpanded = expandedRowKeys.includes(row.key);
    const needsSkeleton = isExpanded && row.hasChildren === true && (!row.children || row.children.length === 0);

    if (needsSkeleton) {
      // Create skeleton placeholder children
      const skeletonChildren = Array.from({ length: skeletonCount }, (_, i) => ({
        key: `${row.key}::skeleton-${i + 1}`,
        attribute: '',
        depth: row.depth + 1,
        hasChildren: false,
        metrics: {},
        _isSkeleton: true,
      })) as unknown as TRow[];

      return { ...row, children: skeletonChildren };
    }

    // Recursively process children
    if (row.children && row.children.length > 0) {
      return { ...row, children: injectSkeletonRows(row.children, expandedRowKeys, skeletonCount) };
    }

    return row;
  });
}

/**
 * Check if a row is a skeleton placeholder row
 * @param row - Table row to check
 * @returns true if the row is a skeleton placeholder
 */
export function isSkeletonRow(row: any): boolean {
  return row._isSkeleton === true;
}
