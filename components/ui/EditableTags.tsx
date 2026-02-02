'use client';

import { useEffect, useState, useRef } from 'react';
import { Input } from 'antd';
import type { InputRef } from 'antd';
import { X, Plus } from 'lucide-react';
import styles from './EditableTags.module.css';

export interface EditableTagsProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  className?: string;
}

export function EditableTags({
  tags,
  onChange,
  placeholder = 'New tag...',
  addLabel = 'Add',
  className,
}: EditableTagsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newValue, setNewValue] = useState('');
  const inputRef = useRef<InputRef>(null);
  const newInputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (editingIndex !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIndex]);

  useEffect(() => {
    if (isAddingNew && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [isAddingNew]);

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(tags[index]);
  };

  const handleSave = () => {
    if (editingIndex !== null && editValue.trim()) {
      const newTags = [...tags];
      newTags[editingIndex] = editValue.trim();
      onChange(newTags);
    }
    setEditingIndex(null);
    setEditValue('');
  };

  const handleDelete = (index: number) => {
    const newTags = tags.filter((_, i) => i !== index);
    onChange(newTags);
  };

  const handleAddNew = () => {
    if (newValue.trim()) {
      onChange([...tags, newValue.trim()]);
      setNewValue('');
      setIsAddingNew(false);
    }
  };

  const handleCancelAdd = () => {
    setNewValue('');
    setIsAddingNew(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, isNew: boolean = false) => {
    if (e.key === 'Escape') {
      if (isNew) {
        handleCancelAdd();
      } else {
        setEditingIndex(null);
        setEditValue('');
      }
    } else if (e.key === 'Enter') {
      if (isNew) {
        handleAddNew();
      } else {
        handleSave();
      }
    }
  };

  return (
    <div className={`${styles.editableTags} ${className || ''}`}>
      {tags.map((tag, index) =>
        editingIndex === index ? (
          <div key={index} className={styles.tagEditing}>
            <Input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={(e) => handleKeyDown(e)}
              className={styles.tagInput}
              size="small"
            />
          </div>
        ) : (
          <span key={index} className={styles.tagEditable} onClick={() => handleEdit(index)}>
            {tag}
            <button
              className={styles.tagDeleteBtn}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(index);
              }}
            >
              <X size={12} />
            </button>
          </span>
        )
      )}

      {isAddingNew ? (
        <div className={styles.tagEditing}>
          <Input
            ref={newInputRef}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onBlur={handleCancelAdd}
            onKeyDown={(e) => handleKeyDown(e, true)}
            placeholder={placeholder}
            className={styles.tagInput}
            size="small"
          />
        </div>
      ) : (
        <button className={styles.addTagBtn} onClick={() => setIsAddingNew(true)}>
          <Plus size={14} />
          {addLabel}
        </button>
      )}
    </div>
  );
}
