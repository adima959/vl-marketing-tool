'use client';

import { useReportStore } from '@/stores/reportStore';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  onLoadData?: () => void;
}

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

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 2.5C3 1.67157 3.9174 1.15311 4.6 1.6L13.2 7.1C13.8627 7.53431 13.8627 8.46569 13.2 8.9L4.6 14.4C3.9174 14.8469 3 14.3284 3 13.5V2.5Z"
      fill="currentColor"
    />
  </svg>
);

export function EmptyState({ onLoadData }: EmptyStateProps) {
  const { loadedDimensions, dateRange } = useReportStore();

  // Generate contextual message based on current filters
  const hasFilters = loadedDimensions.length > 0 || dateRange;
  const message = hasFilters
    ? 'No data found for the selected filters. Try adjusting your date range or dimensions.'
    : 'Get started by selecting dimensions and a date range, then load your data.';

  const suggestions = hasFilters
    ? [
        'Expand your date range',
        'Try different dimension combinations',
        'Check if data exists for this period',
      ]
    : [
        'Select 1-3 dimensions to analyze',
        'Choose a date range',
        'Click "Load Data" to begin',
      ];

  return (
    <div className={styles.emptyContainer}>
      <div className={styles.iconWrapper}>
        <EmptyIcon />
      </div>

      <h3 className={styles.title}>
        {hasFilters ? 'No Data Available' : 'Ready to Explore Your Data?'}
      </h3>

      <p className={styles.message}>{message}</p>

      <div className={styles.suggestions}>
        <p className={styles.suggestionsTitle}>
          {hasFilters ? 'Try this:' : 'Quick start:'}
        </p>
        <ul className={styles.suggestionsList}>
          {suggestions.map((suggestion, index) => (
            <li key={index}>{suggestion}</li>
          ))}
        </ul>
      </div>

      {onLoadData && (
        <button className={styles.loadButton} onClick={onLoadData}>
          <PlayIcon />
          <span>Load Data</span>
        </button>
      )}
    </div>
  );
}
