'use client';

import { useState, useRef, useMemo } from 'react';
import { Popover, Dropdown, Button, Typography } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import type { DimensionGroupConfig } from '@/types/dimensions';
import type { MenuProps } from 'antd';
import styles from '@/components/filters/DimensionPicker.module.css';

const { Text } = Typography;

interface GenericDimensionPickerProps {
  /** Current active dimensions */
  dimensions: string[];
  /** Callback to add a dimension */
  addDimension: (id: string) => void;
  /** Available dimension groups */
  dimensionGroups: DimensionGroupConfig[];
  /** Optional color mapping for group dots (only used in popover variant) */
  groupColors?: Record<string, string>;
  /** UI variant: popover with search or simple dropdown */
  variant?: 'popover' | 'dropdown';
  /** Enable search functionality (only applies to popover variant) */
  searchable?: boolean;
}

/**
 * Generic dimension picker - unified component supporting both popover and dropdown variants
 * Reusable across all dashboards with different dimension configurations
 *
 * @example Popover with search and colors
 * ```tsx
 * <GenericDimensionPicker
 *   variant="popover"
 *   searchable={true}
 *   dimensions={dimensions}
 *   addDimension={addDimension}
 *   dimensionGroups={DIMENSION_GROUPS}
 *   groupColors={{ advertising: '#f59e0b', general: '#10b981' }}
 * />
 * ```
 *
 * @example Simple dropdown
 * ```tsx
 * <GenericDimensionPicker
 *   variant="dropdown"
 *   dimensions={dimensions}
 *   addDimension={addDimension}
 *   dimensionGroups={DIMENSION_GROUPS}
 * />
 * ```
 */
export function GenericDimensionPicker({
  dimensions,
  addDimension,
  dimensionGroups,
  groupColors = {},
  variant = 'popover',
  searchable = true,
}: GenericDimensionPickerProps): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const allSelected = useMemo(() => {
    const allIds = dimensionGroups.flatMap((g) => g.dimensions.map((d) => d.id));
    return allIds.every((id) => dimensions.includes(id));
  }, [dimensionGroups, dimensions]);

  const query = search.toLowerCase().trim();

  const filteredGroups = useMemo(() => {
    if (!query || !searchable) return dimensionGroups;
    return dimensionGroups
      .map((g) => ({
        ...g,
        dimensions: g.dimensions.filter((d) => d.label.toLowerCase().includes(query)),
      }))
      .filter((g) => g.dimensions.length > 0);
  }, [query, dimensionGroups, searchable]);

  if (allSelected) return null;

  const handleSelect = (dimId: string): void => {
    if (dimensions.includes(dimId)) return;
    addDimension(dimId);
  };

  // Dropdown variant (simpler, no search)
  if (variant === 'dropdown') {
    const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
      addDimension(key);
    };

    const items: MenuProps['items'] = dimensionGroups.map((group) => ({
      type: 'group' as const,
      label: (
        <Text type="secondary" className={styles.groupLabel}>
          {group.label}
        </Text>
      ),
      children: group.dimensions.map((dim) => ({
        key: dim.id,
        label: (
          <span className={styles.optionLabel}>
            {dim.label}
            {dimensions.includes(dim.id) && <CheckOutlined className={styles.checkIcon} />}
          </span>
        ),
        disabled: dimensions.includes(dim.id),
      })),
    }));

    return (
      <Dropdown menu={{ items, onClick: handleMenuClick }} trigger={['click']} placement="bottomLeft">
        <Button type="default" icon={<PlusOutlined />} size="middle" className={styles.dimensionPicker} />
      </Dropdown>
    );
  }

  // Popover variant (with search and colors)
  const content = (
    <div className={styles.panel}>
      {searchable && (
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
      )}
      <div className={styles.listArea}>
        {filteredGroups.length === 0 && <div className={styles.empty}>No dimensions found</div>}
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
        if (v && searchable) {
          setSearch('');
          setTimeout(() => inputRef.current?.focus(), 50);
        }
      }}
      placement="bottomLeft"
      classNames={{ root: styles.popover }}
      styles={{
        container: {
          border: '1.5px solid #d1d5db',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
          borderRadius: 12,
        },
      }}
    >
      <button type="button" className={`${styles.triggerBtn} ${open ? styles.triggerBtnOpen : ''}`}>
        <PlusOutlined />
      </button>
    </Popover>
  );
}
