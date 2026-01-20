'use client';

/**
 * Filter Preset Menu Component
 * Dropdown menu for managing and applying filter presets
 */

import { useState } from 'react';
import { useFilterPresetStore } from '@/stores/filterPresetStore';
import { useReportStore } from '@/stores/reportStore';
import { useToast } from '@/hooks/useToast';
import styles from './FilterPresetMenu.module.css';

interface FilterPresetMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSaveModal: () => void;
}

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M7 1L8.854 5.146L13 6.708L9.854 9.854L10.708 14L7 11.708L3.292 14L4.146 9.854L1 6.708L5.146 5.146L7 1Z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1 3.5H13M5.5 1.5H8.5M5.5 6V10.5M8.5 6V10.5M2.5 3.5L3.5 12.5H10.5L11.5 3.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function FilterPresetMenu({ isOpen, onClose, onOpenSaveModal }: FilterPresetMenuProps) {
  const { presets, deletePreset, toggleQuickAccess } = useFilterPresetStore();
  const { setDateRange, setLoadedDimensions, setSort } = useReportStore();
  const { success, error: showError } = useToast();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (!isOpen) return null;

  const applyPreset = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    try {
      // Apply preset values to report store
      if (preset.dateRange) {
        setDateRange(preset.dateRange);
      }
      setLoadedDimensions(preset.dimensions);
      setSort(preset.sortColumn, preset.sortDirection);

      success('Preset Applied', `"${preset.name}" has been loaded`);
      onClose();
    } catch (err) {
      showError('Failed to Apply', 'Could not apply preset');
    }
  };

  const handleDelete = (presetId: string, presetName: string) => {
    deletePreset(presetId);
    success('Preset Deleted', `"${presetName}" has been removed`);
  };

  const sortedPresets = [...presets].sort((a, b) => {
    // Quick access first, then by creation date
    if (a.isQuickAccess && !b.isQuickAccess) return -1;
    if (!a.isQuickAccess && b.isQuickAccess) return 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.menu}>
        <div className={styles.header}>
          <h4 className={styles.title}>Filter Presets</h4>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close menu">
            ×
          </button>
        </div>

        {sortedPresets.length === 0 ? (
          <div className={styles.empty}>
            <p>No saved presets yet</p>
            <p className={styles.emptyHint}>Save your current filters to quickly reuse them later</p>
          </div>
        ) : (
          <div className={styles.presetList}>
            {sortedPresets.map((preset) => (
              <div
                key={preset.id}
                className={styles.presetItem}
                onMouseEnter={() => setHoveredId(preset.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  className={styles.presetButton}
                  onClick={() => applyPreset(preset.id)}
                  title={`Apply "${preset.name}"`}
                >
                  <div className={styles.presetInfo}>
                    <span className={styles.presetName}>{preset.name}</span>
                    <span className={styles.presetMeta}>
                      {preset.dimensions.length} dimension{preset.dimensions.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </button>

                <div className={styles.presetActions}>
                  <button
                    className={`${styles.actionButton} ${preset.isQuickAccess ? styles.starred : ''}`}
                    onClick={() => toggleQuickAccess(preset.id)}
                    title={preset.isQuickAccess ? 'Remove from quick access' : 'Add to quick access'}
                    aria-label={preset.isQuickAccess ? 'Unstar preset' : 'Star preset'}
                  >
                    <StarIcon filled={preset.isQuickAccess} />
                  </button>
                  <button
                    className={styles.actionButton}
                    onClick={() => handleDelete(preset.id, preset.name)}
                    title="Delete preset"
                    aria-label="Delete preset"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          <button className={styles.saveNewButton} onClick={onOpenSaveModal}>
            <PlusIcon />
            <span>Save Current Filters</span>
          </button>
        </div>
      </div>
    </>
  );
}
