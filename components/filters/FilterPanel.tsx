'use client';

import { useCallback } from 'react';
import { Select, Input, ConfigProvider } from 'antd';
import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import type { TableFilter, FilterOperator } from '@/types/filters';
import type { DimensionGroupConfig } from '@/types/dimensions';
import styles from './FilterPanel.module.css';

interface FilterPanelProps {
  filters: TableFilter[];
  onFiltersChange: (filters: TableFilter[]) => void;
  dimensionGroups: DimensionGroupConfig[];
  /** When true, renders without its own box container (for embedding in toolbar) */
  embedded?: boolean;
}

const OPERATOR_OPTIONS: { value: FilterOperator; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
];

function makeFilterId(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Build grouped options for the field Select from dimension groups */
function buildFieldOptions(groups: DimensionGroupConfig[]) {
  return groups.map((group) => ({
    label: group.label,
    options: group.dimensions.map((d) => ({
      value: d.id,
      label: d.label,
    })),
  }));
}

export function FilterPanel({ filters, onFiltersChange, dimensionGroups, embedded }: FilterPanelProps) {
  const fieldOptions = buildFieldOptions(dimensionGroups);

  const addFilter = useCallback(() => {
    const newFilter: TableFilter = {
      id: makeFilterId(),
      field: '',
      operator: 'contains',
      value: '',
    };
    onFiltersChange([...filters, newFilter]);
  }, [filters, onFiltersChange]);

  const removeFilter = useCallback(
    (id: string) => {
      onFiltersChange(filters.filter((f) => f.id !== id));
    },
    [filters, onFiltersChange]
  );

  const updateFilter = useCallback(
    (id: string, patch: Partial<TableFilter>) => {
      onFiltersChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    },
    [filters, onFiltersChange]
  );

  const clearAll = useCallback(() => {
    onFiltersChange([]);
  }, [onFiltersChange]);

  const actionButtons = (
    <div className={styles.actions}>
      <button className={styles.addButton} onClick={addFilter} type="button">
        <PlusOutlined style={{ fontSize: 12 }} />
        Add filter
      </button>
      {filters.length > 0 && (
        <button className={styles.clearButton} onClick={clearAll} type="button">
          Clear all
        </button>
      )}
    </div>
  );

  return (
    <ConfigProvider theme={{ token: { colorBorder: '#e0e2e6', borderRadius: 6 } }}>
    <div className={embedded ? styles.panelEmbedded : styles.panel} data-filter-panel>
      {filters.map((filter, index) => (
        <div key={filter.id} className={styles.filterRow}>
          <span className={styles.logicLabel}>
            {index === 0 ? 'where' : 'and'}
          </span>

          <Select
            className={styles.fieldSelect}
            placeholder="Field"
            value={filter.field || undefined}
            options={fieldOptions}
            onChange={(val) => updateFilter(filter.id, { field: val })}
            showSearch
            optionFilterProp="label"
            size="small"
          />

          <Select
            className={styles.operatorSelect}
            value={filter.operator}
            options={OPERATOR_OPTIONS}
            onChange={(val) => updateFilter(filter.id, { operator: val })}
            size="small"
          />

          <Input
            className={styles.valueInput}
            placeholder="Value"
            value={filter.value}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            size="small"
          />

          <button
            className={styles.removeButton}
            onClick={() => removeFilter(filter.id)}
            title="Remove filter"
            type="button"
          >
            <CloseOutlined style={{ fontSize: 10 }} />
          </button>

          {index === filters.length - 1 && actionButtons}
        </div>
      ))}

      {filters.length === 0 && actionButtons}
    </div>
    </ConfigProvider>
  );
}
