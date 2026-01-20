'use client';

import { useState, useEffect } from 'react';
import { Button, Select, Space } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { DateRangePicker } from './DateRangePicker';
import { DimensionPicker } from './DimensionPicker';
import { DimensionPills } from './DimensionPills';
import { FilterPresetMenu } from './FilterPresetMenu';
import { SavePresetModal } from './SavePresetModal';
import { useReportStore } from '@/stores/reportStore';
import { useFilterPresetStore } from '@/stores/filterPresetStore';
import type { FilterPreset } from '@/stores/filterPresetStore';
import styles from './FilterToolbar.module.css';

const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 1.5L9.708 6.292L14.5 8L9.708 9.708L8 14.5L6.292 9.708L1.5 8L6.292 6.292L8 1.5Z"
      fill="currentColor"
    />
  </svg>
);

const BookmarkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 2C3 1.44772 3.44772 1 4 1H12C12.5523 1 13 1.44772 13 2V14.5L8 11.5L3 14.5V2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  </svg>
);

export function FilterToolbar() {
  const { loadData, isLoading, hasUnsavedChanges, resetFilters } = useReportStore();
  const { getQuickAccessPresets } = useFilterPresetStore();
  const [isPresetMenuOpen, setIsPresetMenuOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [quickAccessPresets, setQuickAccessPresets] = useState<FilterPreset[]>([]);
  const [mounted, setMounted] = useState(false);

  // Only access localStorage after mounting on client to prevent hydration errors
  useEffect(() => {
    setMounted(true);
    setQuickAccessPresets(getQuickAccessPresets());
  }, [getQuickAccessPresets]);

  return (
    <div className={styles.toolbar}>
      {/* Row 1: Date and Load Data button */}
      <Space size={12} wrap className={styles.topRow}>
        <DateRangePicker />

        <div className={styles.loadButtonWrapper}>
          <Button
            type={hasUnsavedChanges ? 'primary' : 'default'}
            icon={<ReloadOutlined />}
            onClick={loadData}
            loading={isLoading}
            disabled={!hasUnsavedChanges}
            size="large"
          >
            Load Data
          </Button>
          {hasUnsavedChanges && (
            <span className={styles.unsavedDot} title="Unsaved filter changes" />
          )}
        </div>

        {hasUnsavedChanges && (
          <button className={styles.resetButton} onClick={resetFilters} title="Reset filters">
            Reset
          </button>
        )}

        <button
          className={styles.presetButton}
          onClick={() => setIsPresetMenuOpen(true)}
          title="Manage filter presets"
        >
          <BookmarkIcon />
          <span>Presets</span>
        </button>

        <button
          className={styles.saveButton}
          onClick={() => setIsSaveModalOpen(true)}
          title="Save current filters"
        >
          <StarIcon />
        </button>

        <Select
          defaultValue="standard"
          size="large"
          className={styles.selectReport}
          options={[
            { value: 'standard', label: 'Standard Report' },
            { value: 'conversion', label: 'Conversion' },
            { value: 'revenue', label: 'Revenue' },
          ]}
        />
      </Space>

      {/* Quick Access Presets - only render after mount to prevent hydration errors */}
      {mounted && quickAccessPresets.length > 0 && (
        <div className={styles.quickAccessRow}>
          <span className={styles.quickAccessLabel}>Quick:</span>
          <div className={styles.quickAccessPresets}>
            {quickAccessPresets.map((preset) => (
              <button
                key={preset.id}
                className={styles.quickAccessChip}
                onClick={() => {
                  // Apply preset
                  const { setDateRange, setLoadedDimensions, setSort } = useReportStore.getState();
                  if (preset.dateRange) setDateRange(preset.dateRange);
                  setLoadedDimensions(preset.dimensions);
                  setSort(preset.sortColumn, preset.sortDirection);
                }}
                title={`Apply "${preset.name}"`}
              >
                <StarIcon />
                <span>{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Row 2: Dimension pills and add dimension */}
      <div className={styles.bottomRow}>
        <span className={styles.dimensionsLabel}>Dimensions:</span>
        <Space size={10} wrap className={styles.dimensionsContent}>
          <DimensionPills />
          <DimensionPicker />
        </Space>
      </div>

      {/* Modals */}
      <FilterPresetMenu
        isOpen={isPresetMenuOpen}
        onClose={() => setIsPresetMenuOpen(false)}
        onOpenSaveModal={() => {
          setIsPresetMenuOpen(false);
          setIsSaveModalOpen(true);
        }}
      />
      <SavePresetModal isOpen={isSaveModalOpen} onClose={() => setIsSaveModalOpen(false)} />
    </div>
  );
}
