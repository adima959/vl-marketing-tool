'use client';

import { useMemo } from 'react';
import type { ValidationRateMetric } from '@/types';

interface ValidationRateCellProps {
  metric: ValidationRateMetric; // { rate, trials, approved }
  onClick?: () => void;
}

/** Minimum subscriptions required for a cell to display */
export const MIN_SUBSCRIPTIONS_THRESHOLD = 3;

/**
 * Color-coded cell for validation rate percentages
 *
 * Color scale (text color):
 * - >81%: Green
 * - ≤81%: Red
 *
 * Display: Trial count on top, percentage below
 * Trial count is clickable to show details modal
 * Cells with fewer than MIN_SUBSCRIPTIONS_THRESHOLD trials are filtered out
 */
export function ValidationRateCell({ metric, onClick }: ValidationRateCellProps) {
  const { rate, trials } = metric;

  // Show nothing if below threshold
  if (trials < MIN_SUBSCRIPTIONS_THRESHOLD) {
    return null;
  }

  const { textColor, rateDisplay } = useMemo(() => {
    const percentage = (rate * 100).toFixed(0);
    const rateDisplay = `${percentage}%`;

    // Determine text color based on rate
    // >81% = green (success), ≤81% = red (error)
    const textColor = rate > 0.81 ? 'var(--color-success)' : 'var(--color-error)';

    return {
      textColor,
      rateDisplay,
    };
  }, [rate]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '4px 8px',
        minWidth: '70px',
      }}
    >
      <span
        onClick={onClick ? onClick : undefined}
        style={{
          color: 'var(--color-gray-700)',
          fontWeight: 600,
          fontSize: 'var(--font-size-sm)',
          fontVariantNumeric: 'tabular-nums',
          cursor: onClick ? 'pointer' : 'default',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => {
          if (onClick) {
            e.currentTarget.style.textDecoration = 'underline';
          }
        }}
        onMouseLeave={(e) => {
          if (onClick) {
            e.currentTarget.style.textDecoration = 'none';
          }
        }}
      >
        {trials}
      </span>
      <span
        style={{
          color: textColor,
          fontWeight: 500,
          fontSize: 'var(--font-size-sm)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rateDisplay}
      </span>
    </div>
  );
}
