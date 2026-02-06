'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Select } from 'antd';
import { Pencil } from 'lucide-react';
import styles from './EditableSelect.module.css';
import dropdownStyles from '@/styles/components/dropdown.module.css';

export interface EditableSelectOption {
  value: string;
  label: string;
}

export interface EditableSelectProps {
  value: string | undefined;
  options: EditableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Display label for current value (if different from option label) */
  displayLabel?: string;
}

export function EditableSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className,
  displayLabel,
}: EditableSelectProps) {
  const [isEditing, setIsEditing] = useState(false);
  // Optimistic display value - shows saved content immediately before parent state updates
  const [optimisticValue, setOptimisticValue] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clear optimistic value when parent catches up
  useEffect(() => {
    if (optimisticValue !== null && value === optimisticValue) {
      setOptimisticValue(null);
    }
  }, [value, optimisticValue]);

  // Handle clicks outside to close
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside the container
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }
      // Don't close if clicking inside the ant-select dropdown (rendered in portal)
      if (target.closest('.ant-select-dropdown')) {
        return;
      }
      setIsEditing(false);
    };

    // Small delay to allow the select dropdown to render
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditing]);

  const handleChange = useCallback(
    (newValue: string) => {
      if (newValue !== value) {
        setOptimisticValue(newValue);
        onChange(newValue);
      }
      setIsEditing(false);
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
    }
  }, []);

  // Get display value
  const currentValue = optimisticValue ?? value;
  const currentOption = options.find((opt) => opt.value === currentValue);
  // When we have an optimistic value, use the option label (not the stale displayLabel from parent)
  const displayText = optimisticValue !== null
    ? (currentOption?.label || placeholder)
    : (displayLabel || currentOption?.label || placeholder);
  const isEmpty = !currentValue;

  if (isEditing) {
    return (
      <div ref={containerRef} className={`${styles.editableSelectEditing} ${className || ''}`}>
        <Select
          value={currentValue}
          onChange={handleChange}
          options={options}
          placeholder={placeholder}
          className={styles.selectInput}
          autoFocus
          defaultOpen
          popupMatchSelectWidth={false}
          onKeyDown={handleKeyDown}
          classNames={{ popup: { root: dropdownStyles.selectDropdown } }}
        />
      </div>
    );
  }

  return (
    <div
      className={`${styles.editableSelect} ${isEmpty ? styles.editableSelectEmpty : ''} ${className || ''}`}
      onClick={() => setIsEditing(true)}
    >
      <span className={styles.editableSelectText}>{displayText}</span>
      <Pencil size={14} className={styles.editableSelectIcon} />
    </div>
  );
}
