'use client';

import { useState, useRef, useMemo } from 'react';
import { Popover } from 'antd';
import { PlusOutlined, CheckOutlined } from '@ant-design/icons';
import { DIMENSION_GROUPS } from '@/config/dimensions';
import { useReportStore } from '@/stores/reportStore';
import styles from './DimensionPicker.module.css';

const GROUP_COLORS: Record<string, string> = {
  advertising: '#f59e0b',
  general: '#10b981',
  pages: '#3b82f6',
  visitor: '#8b5cf6',
  geo: '#06b6d4',
  device: '#ec4899',
  orders: '#f97316',
  crm: '#8b5cf6',
  classification: '#3b82f6',
};

export function DimensionPicker(): React.ReactElement {
  const { dimensions, addDimension } = useReportStore();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const query = search.toLowerCase().trim();

  const filteredGroups = useMemo(() => {
    if (!query) return DIMENSION_GROUPS;
    return DIMENSION_GROUPS
      .map((g) => ({
        ...g,
        dimensions: g.dimensions.filter((d) =>
          d.label.toLowerCase().includes(query)
        ),
      }))
      .filter((g) => g.dimensions.length > 0);
  }, [query]);

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
                style={{ background: GROUP_COLORS[group.id] ?? '#9ca3af' }}
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
      overlayClassName={styles.popover}
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
