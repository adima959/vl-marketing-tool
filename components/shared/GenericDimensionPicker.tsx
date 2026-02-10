'use client';

import { useState, useRef, useMemo } from 'react';
import { Popover } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import type { DimensionGroupConfig } from '@/types/dimensions';
import styles from '@/components/filters/DimensionPicker.module.css';

interface GenericDimensionPickerProps {
  /** Current active dimensions */
  dimensions: string[];
  /** Callback to add a dimension */
  addDimension: (id: string) => void;
  /** Available dimension groups */
  dimensionGroups: DimensionGroupConfig[];
  /** Optional color mapping for group dots */
  groupColors?: Record<string, string>;
}

/**
 * Generic dimension picker with search and grouped list
 * Reusable across all dashboards with different dimension configurations
 *
 * @example
 * ```tsx
 * <GenericDimensionPicker
 *   dimensions={dimensions}
 *   addDimension={addDimension}
 *   dimensionGroups={DIMENSION_GROUPS}
 *   groupColors={{ advertising: '#f59e0b', general: '#10b981' }}
 * />
 * ```
 */
export function GenericDimensionPicker({
  dimensions,
  addDimension,
  dimensionGroups,
  groupColors = {},
}: GenericDimensionPickerProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const query = search.toLowerCase().trim();

  const filteredGroups = useMemo(() => {
    if (!query) return dimensionGroups;
    return dimensionGroups
      .map((g) => ({
        ...g,
        dimensions: g.dimensions.filter((d) =>
          d.label.toLowerCase().includes(query)
        ),
      }))
      .filter((g) => g.dimensions.length > 0);
  }, [query, dimensionGroups]);

  const handleSelect = (dimId: string): void => {
    if (dimensions.includes(dimId)) return;
    addDimension(dimId);
  };

  const content = (
    <div className={styles.panel}>
      <div className={styles.searchWrapper}>
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          placeholder="Search dimensions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className={styles.listArea}>
        {filteredGroups.length === 0 && (
          <div className={styles.empty}>No dimensions found</div>
        )}
        {filteredGroups.map((group) => (
          <div key={group.id} className={styles.group}>
            <div className={styles.groupHeader}>
              <span
                className={styles.groupDot}
                style={{ background: groupColors[group.id] ?? '#9ca3af' }}
              />
              <span className={styles.groupLabel}>{group.label}</span>
            </div>
            {group.dimensions.map((dim) => {
              const selected = dimensions.includes(dim.id);
              return (
                <div
                  key={dim.id}
                  className={`${styles.item} ${selected ? styles.itemSelected : ''}`}
                  onClick={() => handleSelect(dim.id)}
                >
                  <span className={styles.itemLabel}>{dim.label}</span>
                  <CheckOutlined className={styles.itemCheck} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setSearch('');
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      }}
      placement="bottomLeft"
      classNames={{ root: styles.popover }}
    >
      <button
        type="button"
        className={`${styles.triggerBtn} ${open ? styles.triggerBtnOpen : ''}`}
      >
        <PlusOutlined />
      </button>
    </Popover>
  );
}
