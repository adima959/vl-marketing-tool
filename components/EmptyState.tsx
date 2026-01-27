'use client';

import styles from './EmptyState.module.css';

const EmptyIcon = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="2" opacity="0.2" />
    <path
      d="M40 50C40 44.4772 44.4772 40 50 40H70C75.5228 40 80 44.4772 80 50V70C80 75.5228 75.5228 80 70 80H50C44.4772 80 40 75.5228 40 70V50Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.3"
    />
    <path d="M52 58H68M52 68H68" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
  </svg>
);

export function EmptyState() {
  const suggestions = [
    'Expand your date range',
    'Try different dimension combinations',
    'Check if data exists for this period',
  ];

  return (
    <div className={styles.emptyContainer}>
      <div className={styles.iconWrapper}>
        <EmptyIcon />
      </div>

      <h3 className={styles.title}>No Data Available</h3>

      <p className={styles.message}>
        No data found for the selected filters. Try adjusting your date range or dimensions.
      </p>

      <div className={styles.suggestions}>
        <p className={styles.suggestionsTitle}>Try this:</p>
        <ul className={styles.suggestionsList}>
          {suggestions.map((suggestion, index) => (
            <li key={index}>{suggestion}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
