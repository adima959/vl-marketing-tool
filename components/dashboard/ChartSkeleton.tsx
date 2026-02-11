import styles from './DashboardTimeSeriesChart.module.css';

export function ChartSkeleton(): React.ReactElement {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonYAxis}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className={styles.skeletonYTick} />
        ))}
      </div>
      <div className={styles.skeletonContent}>
        <div className={styles.skeletonGrid}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className={styles.skeletonGridLine} />
          ))}
        </div>
        <div className={styles.skeletonLine} />
      </div>
    </div>
  );
}
