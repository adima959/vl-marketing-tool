'use client';

import { Skeleton } from 'antd';
import styles from './TableSkeleton.module.css';

interface TableSkeletonProps {
  /**
   * Number of rows to show in skeleton
   * @default 10
   */
  rows?: number;

  /**
   * Number of columns to show in skeleton
   * @default 5
   */
  columns?: number;

  /**
   * Column widths in pixels (if not provided, uses equal widths)
   */
  columnWidths?: number[];
}

/**
 * Table skeleton loader with shimmer effect
 * Shows placeholder rows while table data is loading
 */
export function TableSkeleton({ rows = 10, columns = 5, columnWidths }: TableSkeletonProps) {
  // Calculate column widths
  const widths = columnWidths || Array(columns).fill(100 / columns).map(w => `${w}%`);

  return (
    <div className={styles.tableSkeleton}>
      {/* Header row */}
      <div className={styles.headerRow}>
        {widths.map((width, i) => (
          <div key={i} className={styles.headerCell} style={{ width }}>
            <Skeleton.Input active size="small" block />
          </div>
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className={styles.dataRow}>
          {widths.map((width, colIndex) => (
            <div key={colIndex} className={styles.dataCell} style={{ width }}>
              <Skeleton.Input active size="small" block />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
