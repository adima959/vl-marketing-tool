'use client';

import { useMemo } from 'react';
import type { ApprovalRateMetric } from '@/types';

interface ApprovalRateCellProps {
  metric: ApprovalRateMetric; // { rate, trials, approved }
  onClick?: () => void;
}

/** Minimum subscriptions required for a cell to display */
export const MIN_SUBSCRIPTIONS_THRESHOLD = 3;

/**
 * Color-coded cell for approval rate percentages
 *
 * Color scale (text color):
 * - <80%: Red
 * - <95%: Normal (gray)
 * - 96%+: Green
 *
 * Display: Trial count on top, percentage below
 * Trial count is clickable to show details modal
 * Cells with fewer than MIN_SUBSCRIPTIONS_THRESHOLD trials are filtered out
 */
export function ApprovalRateCell({ metric, onClick }: ApprovalRateCellProps) {
  const { rate, trials } = metric;

  // Show nothing if below threshold
  if (trials < MIN_SUBSCRIPTIONS_THRESHOLD) {
    return null;
  }

  const { textColor, rateDisplay } = useMemo(() => {
    const percentage = (rate * 100).toFixed(0);
    const rateDisplay = `${percentage}%`;

    // Determine text color based on rate
    let textColor: string;
    if (rate >= 0.96) {
      textColor = '#16a34a'; // Green-600 (darker for better readability)
    } else if (rate >= 0.95) {
      textColor = '#374151'; // Gray-700 (normal)
    } else if (rate >= 0.80) {
      textColor = '#374151'; // Gray-700 (normal)
    } else {
      textColor = '#ef4444'; // Red-500
    }

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
          color: '#374151', // Default text color
          fontWeight: 600,
          fontSize: '13px',
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
          fontSize: '13px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rateDisplay}
      </span>
    </div>
  );
}
