'use client';

import styles from './TableSkeleton.module.css';

interface TableSkeletonProps {
  /**
   * Number of rows to show in skeleton
   * @default 10
   */
  rows?: number;

  /**
   * Number of columns to show in skeleton
   * @default 8
   */
  columns?: number;

  /**
   * Column widths (supports px numbers or % strings)
   * If not provided, uses default pattern: first column 400px, others 110-135px
   */
  columnWidths?: (number | string)[];
}

export function TableSkeleton({ rows = 10, columns = 8, columnWidths }: TableSkeletonProps) {
  // Generate deterministic widths based on column index to avoid hydration mismatches
  const getColumnWidth = (colIndex: number): string => {
    // If explicit widths provided, use them
    if (columnWidths) {
      const width = columnWidths[colIndex];
      if (width !== undefined) {
        return typeof width === 'number' ? `${width}px` : width;
      }
    }

    // Default pattern for dashboard tables
    if (colIndex === 0) return '400px';
    const widths = [110, 120, 130, 115, 125, 135, 120];
    return `${widths[colIndex % widths.length]}px`;
  };

  return (
    <div className={styles.container}>
      {/* Header row */}
      <div className={styles.header}>
        {Array.from({ length: columns }).map((_, colIndex) => (
          <div
            key={`header-${colIndex}`}
            className={styles.headerCell}
            style={{
              width: getColumnWidth(colIndex),
            }}
          >
            <div className={styles.skeleton} style={{ width: '60%' }} />
          </div>
        ))}
      </div>

      {/* Body rows */}
      <div className={styles.body}>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={`row-${rowIndex}`} className={styles.row}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div
                key={`cell-${rowIndex}-${colIndex}`}
                className={styles.cell}
                style={{
                  width: getColumnWidth(colIndex),
                }}
              >
                <div
                  className={styles.skeleton}
                  style={{
                    width: colIndex === 0 ? '70%' : '50%',
                    animationDelay: `${(rowIndex * columns + colIndex) * 0.05}s`,
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
