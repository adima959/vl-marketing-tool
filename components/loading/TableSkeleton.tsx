'use client';

import styles from './TableSkeleton.module.css';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 10, columns = 8 }: TableSkeletonProps) {
  // Generate deterministic widths based on column index to avoid hydration mismatches
  const getColumnWidth = (colIndex: number): string => {
    if (colIndex === 0) return '400px';
    // Use deterministic widths based on column index
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
