'use client';

import { useState } from 'react';
import styles from './ErrorMessage.module.css';

interface ErrorMessageProps {
  error: string | Error;
  onRetry?: () => void;
  title?: string;
  showDetails?: boolean;
}

const ErrorIcon = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
    <path d="M24 14V26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="24" cy="32" r="1.5" fill="currentColor" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C9.84955 2 11.5 2.87868 12.5607 4.25"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path d="M10 4H13V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 12 12"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}
  >
    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function ErrorMessage({
  error,
  onRetry,
  title = 'Error Loading Data',
  showDetails = true,
}: ErrorMessageProps) {
  const [isStackTraceVisible, setIsStackTraceVisible] = useState(false);

  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'object' && 'stack' in error ? error.stack : undefined;

  // Only show stack trace in development
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className={styles.errorContainer}>
      <div className={styles.errorCard}>
        <div className={styles.iconWrapper}>
          <ErrorIcon />
        </div>

        <div className={styles.content}>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.message}>{errorMessage}</p>

          <div className={styles.actions}>
            {onRetry && (
              <button className={styles.retryButton} onClick={onRetry}>
                <RefreshIcon />
                <span>Try Again</span>
              </button>
            )}
            {showDetails && isDevelopment && errorStack && (
              <button
                className={styles.detailsButton}
                onClick={() => setIsStackTraceVisible(!isStackTraceVisible)}
              >
                <span>View Details</span>
                <ChevronIcon isOpen={isStackTraceVisible} />
              </button>
            )}
          </div>

          {isStackTraceVisible && errorStack && (
            <div className={styles.stackTrace}>
              <pre>{errorStack}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
