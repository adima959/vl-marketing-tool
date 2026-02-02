'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { Input } from 'antd';
import type { InputRef } from 'antd';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Pencil,
} from 'lucide-react';
import styles from './EditableHeader.module.css';

export interface EditableHeaderProps {
  title: string;
  description: string;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  titlePlaceholder?: string;
  descriptionPlaceholder?: string;
  label?: string;
  className?: string;
}

function ToolbarButton({
  onAction,
  isActive,
  children,
  title,
}: {
  onAction: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction();
      }}
      className={`${styles.toolbarButton} ${isActive ? styles.toolbarButtonActive : ''}`}
      title={title}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  return (
    <div className={styles.toolbar} onMouseDown={(e) => e.preventDefault()}>
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Cmd+B)"
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Cmd+I)"
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive('underline')}
        title="Underline (Cmd+U)"
      >
        <UnderlineIcon size={16} />
      </ToolbarButton>
      <div className={styles.toolbarDivider} />
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading"
      >
        <Heading2 size={16} />
      </ToolbarButton>
      <div className={styles.toolbarDivider} />
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered size={16} />
      </ToolbarButton>
    </div>
  );
}

export function EditableHeader({
  title,
  description,
  onTitleChange,
  onDescriptionChange,
  titlePlaceholder = 'Enter title...',
  descriptionPlaceholder = 'Add a description...',
  label,
  className,
}: EditableHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<InputRef>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: descriptionPlaceholder,
      }),
      Underline,
    ],
    content: description,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: styles.editorContent,
      },
      handleKeyDown: (view, event) => {
        if (event.metaKey || event.ctrlKey) {
          if (['b', 'i', 'u'].includes(event.key.toLowerCase())) {
            event.stopPropagation();
            return false;
          }
        }
        return false;
      },
    },
  });

  // Sync state when props change
  useEffect(() => {
    if (!isEditing) {
      setEditTitle(title);
      if (editor) {
        const currentContent = editor.getHTML();
        if (currentContent !== description) {
          editor.commands.setContent(description || '');
        }
      }
    }
  }, [title, description, editor, isEditing]);

  const handleSave = useCallback(() => {
    // Save title if changed
    if (editTitle !== title) {
      onTitleChange(editTitle);
    }

    // Save description if changed
    if (editor) {
      const html = editor.getHTML();
      const isEmpty = html === '<p></p>' || html === '';
      const cleanValue = isEmpty ? '' : html;

      if (cleanValue !== description) {
        onDescriptionChange(cleanValue);
      }
    }

    setIsEditing(false);
  }, [editTitle, title, onTitleChange, editor, description, onDescriptionChange]);

  const handleCancel = useCallback(() => {
    setEditTitle(title);
    editor?.commands.setContent(description || '');
    setIsEditing(false);
  }, [title, description, editor]);

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.input?.select();
    }, 0);
  }, []);

  // Handle clicks outside
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleSave();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, handleSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault();
        handleSave();
      }
    },
    [handleCancel, handleSave]
  );

  // View mode
  if (!isEditing) {
    const hasDescription = description && description !== '<p></p>';

    return (
      <div
        className={`${styles.editableHeader} ${className || ''}`}
        onClick={handleStartEditing}
      >
        {label && <span className={styles.label}>{label}</span>}
        <h1 className={styles.title}>
          {title || <span className={styles.placeholder}>{titlePlaceholder}</span>}
        </h1>
        {hasDescription ? (
          <div
            className={styles.description}
            dangerouslySetInnerHTML={{ __html: description }}
          />
        ) : (
          <p className={styles.descriptionPlaceholder}>{descriptionPlaceholder}</p>
        )}
        <Pencil size={16} className={styles.editIcon} />
      </div>
    );
  }

  // Edit mode
  return (
    <div
      ref={containerRef}
      className={`${styles.editableHeaderEditing} ${className || ''}`}
      onKeyDown={handleKeyDown}
    >
      {label && <span className={styles.labelEditing}>{label}</span>}
      <Input
        ref={titleInputRef}
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        placeholder={titlePlaceholder}
        className={styles.titleInput}
        variant="borderless"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey) {
            e.preventDefault();
            editor?.commands.focus('start');
          }
        }}
      />
      <div className={styles.descriptionEditor}>
        <Toolbar editor={editor} />
        <div className={styles.editorWrapper}>
          <EditorContent editor={editor} />
        </div>
      </div>
      <div className={styles.editorHint}>
        <kbd>Esc</kbd> cancel · <kbd>⌘+Enter</kbd> save · click outside to save
      </div>
    </div>
  );
}
