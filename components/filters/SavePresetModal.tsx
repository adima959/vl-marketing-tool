'use client';

/**
 * Save Preset Modal Component
 * Modal for saving current filter state as a preset
 */

import { useState } from 'react';
import { useFilterPresetStore } from '@/stores/filterPresetStore';
import { useReportStore } from '@/stores/reportStore';
import { useToast } from '@/hooks/useToast';
import styles from './SavePresetModal.module.css';

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SavePresetModal({ isOpen, onClose }: SavePresetModalProps) {
  const [presetName, setPresetName] = useState('');
  const [isQuickAccess, setIsQuickAccess] = useState(false);
  const { addPreset } = useFilterPresetStore();
  const { dateRange, loadedDimensions, sortColumn, sortDirection } = useReportStore();
  const { success, error: showError } = useToast();

  if (!isOpen) return null;

  const handleSave = () => {
    if (!presetName.trim()) {
      showError('Name Required', 'Please enter a name for this preset');
      return;
    }

    try {
      addPreset({
        name: presetName.trim(),
        dateRange,
        dimensions: loadedDimensions,
        sortColumn,
        sortDirection,
        isQuickAccess,
      });

      success('Preset Saved', `"${presetName.trim()}" has been created`);

      // Reset form and close
      setPresetName('');
      setIsQuickAccess(false);
      onClose();
    } catch (err) {
      showError('Save Failed', 'Could not save preset');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.header}>
          <h4 className={styles.title}>Save Filter Preset</h4>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.formGroup}>
            <label htmlFor="preset-name" className={styles.label}>
              Preset Name
            </label>
            <input
              id="preset-name"
              type="text"
              className={styles.input}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g., Q4 Campaign Analysis"
              autoFocus
            />
          </div>

          <div className={styles.checkboxGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={isQuickAccess}
                onChange={(e) => setIsQuickAccess(e.target.checked)}
              />
              <span>Add to quick access</span>
            </label>
            <p className={styles.checkboxHint}>
              Quick access presets appear as chips in the filter toolbar
            </p>
          </div>

          <div className={styles.preview}>
            <h5 className={styles.previewTitle}>What will be saved:</h5>
            <ul className={styles.previewList}>
              {dateRange && (
                <li>
                  <strong>Date Range:</strong> {new Date(dateRange.start).toLocaleDateString()} to {new Date(dateRange.end).toLocaleDateString()}
                </li>
              )}
              <li>
                <strong>Dimensions:</strong>{' '}
                {loadedDimensions.length > 0 ? loadedDimensions.join(', ') : 'None'}
              </li>
              {sortColumn && (
                <li>
                  <strong>Sort:</strong> {sortColumn} ({sortDirection})
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button className={styles.saveButton} onClick={handleSave} disabled={!presetName.trim()}>
            Save Preset
          </button>
        </div>
      </div>
    </>
  );
}
