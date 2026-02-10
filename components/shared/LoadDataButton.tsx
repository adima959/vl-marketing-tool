'use client';

import { Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface LoadDataButtonProps {
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Whether data has been loaded at least once */
  hasLoadedOnce: boolean;
  /** Whether there are unsaved changes to filters/dimensions */
  hasUnsavedChanges: boolean;
  /** Callback when button is clicked */
  onClick: () => void;
  /** Button size */
  size?: 'small' | 'middle' | 'large';
  /** Optional custom label (overrides default labels) */
  label?: string;
  /** Optional CSS class name */
  className?: string;
}

/**
 * Reusable Load Data button with smart state-based styling and labels
 *
 * Button behavior:
 * - Initial state (!hasLoadedOnce): Blue/primary, label "Load Data"
 * - Unsaved changes (hasUnsavedChanges): Blue/primary, label "Update"
 * - No changes (!hasUnsavedChanges): Gray/default, label "Loaded", disabled
 *
 * @example
 * ```tsx
 * <LoadDataButton
 *   isLoading={isLoading}
 *   hasLoadedOnce={hasLoadedOnce}
 *   hasUnsavedChanges={hasUnsavedChanges}
 *   onClick={loadData}
 * />
 * ```
 */
export function LoadDataButton({
  isLoading,
  hasLoadedOnce,
  hasUnsavedChanges,
  onClick,
  size = 'middle',
  label,
  className,
}: LoadDataButtonProps) {
  // Determine button label based on state
  const buttonLabel = label ?? (!hasLoadedOnce ? 'Load Data' : hasUnsavedChanges ? 'Update' : 'Loaded');

  // Button is primary (blue) if data hasn't been loaded yet or there are unsaved changes
  const isPrimary = !hasLoadedOnce || hasUnsavedChanges;

  // Button is disabled if data has been loaded and there are no unsaved changes
  const isDisabled = hasLoadedOnce && !hasUnsavedChanges;

  return (
    <Button
      type={isPrimary ? 'primary' : 'default'}
      icon={<ReloadOutlined />}
      onClick={onClick}
      loading={isLoading}
      disabled={isDisabled}
      size={size}
      className={className}
    >
      {buttonLabel}
    </Button>
  );
}
