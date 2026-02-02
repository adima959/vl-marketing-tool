'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Input } from 'antd';
import type { InputRef } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { Pencil } from 'lucide-react';
import styles from './EditableField.module.css';

const { TextArea } = Input;

export interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  quoted?: boolean;
  className?: string;
}

export function EditableField({
  value,
  onChange,
  placeholder = 'Click to add...',
  multiline = false,
  quoted = false,
  className,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<InputRef>(null);
  const textAreaRef = useRef<TextAreaRef>(null);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing) {
      if (multiline && textAreaRef.current) {
        textAreaRef.current.focus();
      } else if (!multiline && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [isEditing, multiline]);

  const handleSave = useCallback(() => {
    setIsEditing(false);
    if (editValue !== value) {
      onChange(editValue);
    }
  }, [editValue, value, onChange]);

  const handleCancel = useCallback(() => {
    setEditValue(value);
    setIsEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && !multiline) {
        handleSave();
      } else if (e.key === 'Enter' && e.metaKey && multiline) {
        handleSave();
      }
    },
    [handleSave, handleCancel, multiline]
  );

  if (isEditing) {
    return (
      <div className={`${styles.editableFieldEditing} ${className || ''}`}>
        {multiline ? (
          <TextArea
            ref={textAreaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoSize={{ minRows: 2, maxRows: 6 }}
            className={styles.editableInput}
          />
        ) : (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={styles.editableInput}
          />
        )}
      </div>
    );
  }

  const displayValue = value || placeholder;
  const isEmpty = !value;

  return (
    <div
      className={`${styles.editableField} ${isEmpty ? styles.editableFieldEmpty : ''} ${className || ''}`}
      onClick={() => setIsEditing(true)}
    >
      <span className={styles.editableFieldText}>
        {quoted && !isEmpty ? `"${displayValue}"` : displayValue}
      </span>
      <Pencil size={14} className={styles.editableFieldIcon} />
    </div>
  );
}
