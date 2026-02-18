import styles from './ConceptDetailPanel.module.css';

/** Skeleton content rendered inside the shared panel wrapper (no overlay/backdrop/panel of its own). */
export function ConceptPanelSkeleton(): React.ReactNode {
  return (
    <>
      <div className={styles.header}>
        <div className={styles.headerInner}>
          {/* Skeleton Row 1: Meta + Controls */}
          <div className={styles.headerMeta}>
            <div className={styles.skeletonBar} style={{ width: 80, height: 20, borderRadius: 4 }} />
            <div className={styles.skeletonBar} style={{ width: 60, height: 14 }} />
            <div className={styles.skeletonBar} style={{ width: 1, height: 14 }} />
            <div className={styles.skeletonBar} style={{ width: 22, height: 22, borderRadius: '50%' }} />
            <div className={styles.skeletonBar} style={{ width: 90, height: 14 }} />
            <div className={styles.skeletonBar} style={{ width: 1, height: 14 }} />
            <div className={styles.skeletonBar} style={{ width: 70, height: 14 }} />
            <div className={styles.headerControls}>
              <div className={styles.skeletonBar} style={{ width: 32, height: 32, borderRadius: 6 }} />
              <div className={styles.skeletonBar} style={{ width: 32, height: 32, borderRadius: 6 }} />
              <div className={styles.skeletonBar} style={{ width: 32, height: 32, borderRadius: 6 }} />
            </div>
          </div>
          {/* Skeleton Row 2: Stage + Title */}
          <div className={styles.headerTitle}>
            <div className={styles.skeletonBar} style={{ width: 80, height: 24, borderRadius: 12 }} />
            <div className={styles.skeletonBar} style={{ width: '45%', height: 28 }} />
          </div>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.bodyContent}>
          <div className={styles.hypothesisGrid}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={styles.hypothesisCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <div className={styles.skeletonBar} style={{ width: 22, height: 22, borderRadius: '50%' }} />
                  <div className={styles.skeletonBar} style={{ width: '50%', height: 11 }} />
                </div>
                <div className={styles.skeletonBar} style={{ width: '90%', height: 14, marginBottom: 6 }} />
                <div className={styles.skeletonBar} style={{ width: '65%', height: 14 }} />
              </div>
            ))}
          </div>
          <div className={styles.copyVariationsSection}>
            <div className={styles.copyVariationsHeader}>
              <div className={styles.skeletonBar} style={{ width: 120, height: 16 }} />
              <div className={styles.skeletonBar} style={{ width: 55, height: 18, borderRadius: 10 }} />
            </div>
            <div className={styles.copyTableWrap}>
              <div style={{ display: 'flex', padding: '6px 10px', gap: 0, background: 'var(--color-gray-50)', borderBottom: '1px solid var(--color-gray-200)' }}>
                <div style={{ width: 32 }} />
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 560, padding: '0 10px' }}>
                    <div className={styles.skeletonBar} style={{ width: 80, height: 12 }} />
                  </div>
                ))}
              </div>
              {[0, 1].map(i => (
                <div key={i} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--color-gray-100)' }}>
                  <div style={{ width: 32, display: 'flex', justifyContent: 'center' }}>
                    <div className={styles.skeletonBar} style={{ width: 12, height: 12 }} />
                  </div>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(j => (
                    <div key={j} style={{ width: 140, padding: '0 8px' }}>
                      <div className={styles.skeletonBar} style={{ width: '80%', height: 14 }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
