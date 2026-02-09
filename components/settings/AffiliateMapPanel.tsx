'use client';

import { Link2 } from 'lucide-react';
import styles from './data-maps.module.css';

export function AffiliateMapPanel(): React.ReactNode {
  return (
    <div className={styles.placeholder}>
      <Link2 className={styles.placeholderIcon} />
      <span className={styles.placeholderText}>Affiliate mapping coming soon</span>
    </div>
  );
}
