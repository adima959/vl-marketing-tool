'use client';

import { useMemo } from 'react';
import { Tooltip } from 'antd';
import type { ValidationRateMetric } from '@/types';

interface ValidationRateCellProps {
  metric: ValidationRateMetric; // { rate, trials, approved }
  rateType?: 'approval' | 'pay' | 'buy';
  onClick?: () => void;
}

/** Minimum subscriptions required for a cell to display */
export const MIN_SUBSCRIPTIONS_THRESHOLD = 3;

/** Labels for tooltip per rate type */
const RATE_TYPE_LABELS = {
  approval: { denominator: 'Subscriptions', numerator: 'Approved Trials', rate: 'Approval Rate' },
  pay: { denominator: 'Invoices', numerator: 'Paid', rate: 'Pay Rate' },
  buy: { denominator: 'Invoices', numerator: 'Bought', rate: 'Buy Rate' },
} as const;

/**
 * Color-coded cell for validation rate percentages
 *
 * Color scale (text color):
 * - >81%: Green
 * - ≤81%: Red
 *
 * Display: Denominator count on top, percentage below
 * Denominator count is clickable to show details modal
 * Cells with fewer than MIN_SUBSCRIPTIONS_THRESHOLD are filtered out
 * Hover tooltip shows full breakdown (denominator, numerator, rate)
 */
export function ValidationRateCell({ metric, rateType, onClick }: ValidationRateCellProps) {
  const { rate, trials, approved } = metric;

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

  const labels = rateType ? RATE_TYPE_LABELS[rateType] : RATE_TYPE_LABELS.approval;

  const tooltipContent = (
    <div style={{ lineHeight: 1.6 }}>
      <div>{labels.denominator}: <strong>{trials.toLocaleString()}</strong></div>
      <div>{labels.numerator}: <strong>{approved.toLocaleString()}</strong></div>
      <div>{labels.rate}: <strong>{(rate * 100).toFixed(1)}%</strong></div>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} placement="top" mouseEnterDelay={0.3}>
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
    </Tooltip>
  );
}
