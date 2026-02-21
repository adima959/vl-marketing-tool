'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Popover } from 'antd';
import { useHoverExpand } from '@/hooks/useHoverExpand';
import styles from './PipelineBoard.module.css';

export interface FilterOption {
  key: string;
  label: string;
  isActive: boolean;
}

interface ExpandableFilterGroupProps {
  label: string;
  options: FilterOption[];
  activeLabels: string[];
  mode: 'single' | 'multi';
  onToggle: (key: string) => void;
  isExpanded: boolean;
  onRequestExpand: () => void;
  onRequestCollapse: () => void;
  threshold?: number;
}

export function ExpandableFilterGroup({
  label,
  options,
  activeLabels,
  mode,
  onToggle,
  isExpanded: externalExpanded,
  onRequestExpand,
  onRequestCollapse,
  threshold = 4,
}: ExpandableFilterGroupProps) {
  const groupRef = useRef<HTMLDivElement>(null);
  const useInline = options.length <= threshold;

  const { isExpanded: hoverExpanded, handlers, close } = useHoverExpand({
    onOpen: onRequestExpand,
    onClose: onRequestCollapse,
  });

  // hoverExpanded drives visibility; useEffect below syncs with parent when another group opens
  const isExpanded = hoverExpanded;

  // If parent actively collapses us (another group opened: true → false), close our timers.
  // We track the previous value so we don't fire during the initial open race condition
  // where child state (hoverExpanded=true) renders before the parent prop catches up.
  const prevExternalRef = useRef(externalExpanded);
  useEffect(() => {
    if (prevExternalRef.current && !externalExpanded && hoverExpanded) {
      close();
    }
    prevExternalRef.current = externalExpanded;
  }, [externalExpanded, hoverExpanded, close]);

  // Close on outside touch
  useEffect(() => {
    if (!isExpanded) return;
    const handler = (e: TouchEvent) => {
      if (!groupRef.current?.contains(e.target as Node)) {
        close();
        onRequestCollapse();
      }
    };
    document.addEventListener('touchstart', handler, { passive: true });
    return () => document.removeEventListener('touchstart', handler);
  }, [isExpanded, close, onRequestCollapse]);

  const handleToggle = useCallback((key: string) => {
    onToggle(key);
    if (mode === 'single') {
      close();
      onRequestCollapse();
    }
  }, [onToggle, mode, close, onRequestCollapse]);

  const chipList = (
    <>
      {options.map(opt => (
        <button
          key={opt.key}
          type="button"
          className={`${styles.chip} ${opt.isActive ? styles.chipActive : ''}`}
          onClick={() => handleToggle(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </>
  );

  // Inline expand mode
  if (useInline) {
    return (
      <div
        ref={groupRef}
        className={styles.expandableGroup}
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        onTouchStart={handlers.onTouchStart}
      >
        <span className={styles.expandableLabel}>
          {label}
          {!isExpanded && activeLabels.length > 0 && (
            <span className={styles.expandableLabelValue}>: {activeLabels.join(', ')}</span>
          )}
        </span>
        <div className={`${styles.expandableChips} ${isExpanded ? styles.expandableChipsVisible : ''}`}>
          <div className={styles.expandableChipsInner}>
            {chipList}
          </div>
        </div>
      </div>
    );
  }

  // Popover mode (>threshold options)
  // Popover renders in a portal (outside group div DOM), so moving the mouse from the
  // label to the dropdown triggers onMouseLeave on the group. Adding hover handlers to
  // the popover content cancels the close timer when the mouse reaches it.
  const popoverContent = (
    <div
      className={styles.filterPopoverContent}
      onMouseEnter={handlers.onMouseEnter}
      onMouseLeave={handlers.onMouseLeave}
    >
      {chipList}
    </div>
  );

  return (
    <div
      ref={groupRef}
      className={styles.expandableGroup}
      onMouseEnter={handlers.onMouseEnter}
      onMouseLeave={handlers.onMouseLeave}
      onTouchStart={handlers.onTouchStart}
    >
      <Popover
        content={popoverContent}
        open={isExpanded}
        trigger={[]}
        placement="bottomLeft"
        overlayClassName={styles.filterPopover}
        arrow={false}
      >
        <span className={styles.expandableLabel}>
          {label}
          {activeLabels.length > 0 && (
            <span className={styles.expandableLabelValue}>: {activeLabels.join(', ')}</span>
          )}
        </span>
      </Popover>
    </div>
  );
}
