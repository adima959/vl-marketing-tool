'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { sanitizeHtml } from '@/lib/sanitize';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading2,
  Quote,
  Code,
  Link as LinkIcon,
  Pencil,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from '@tiptap/extension-link';
import styles from './RichEditableField.module.css';

export interface RichEditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Max height before truncation (default: 80px). Set to 0 to disable. */
  maxCollapsedHeight?: number;
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
      // Use onMouseDown to prevent focus loss from editor
      onMouseDown={(e) => {
        e.preventDefault(); // Prevent blur
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

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      const trimmed = url.trim();
      // Block dangerous protocols (javascript:, data:, vbscript:)
      if (/^(javascript|data|vbscript):/i.test(trimmed)) return;
      editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    }
  };

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
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough size={16} />
      </ToolbarButton>
      <div className={styles.toolbarDivider} />
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading"
      >
        <Heading2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Quote"
      >
        <Quote size={16} />
      </ToolbarButton>
      <ToolbarButton
        onAction={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="Inline Code"
      >
        <Code size={16} />
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
      <div className={styles.toolbarDivider} />
      <ToolbarButton
        onAction={addLink}
        isActive={editor.isActive('link')}
        title="Add Link"
      >
        <LinkIcon size={16} />
      </ToolbarButton>
    </div>
  );
}

export function RichEditableField({
  value,
  onChange,
  placeholder = 'Click to add...',
  className,
  maxCollapsedHeight = 100,
}: RichEditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [needsTruncation, setNeedsTruncation] = useState(false);
  // Optimistic display value - shows saved content immediately before parent state updates
  const [optimisticValue, setOptimisticValue] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Check if content needs truncation
  useEffect(() => {
    if (contentRef.current && maxCollapsedHeight > 0) {
      const scrollHeight = contentRef.current.scrollHeight;
      setNeedsTruncation(scrollHeight > maxCollapsedHeight);
    }
  }, [value, maxCollapsedHeight]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
        },
      }),
    ],
    content: value,
    immediatelyRender: false, // Prevent SSR hydration mismatch
    editorProps: {
      attributes: {
        class: styles.editorContent,
      },
      // Intercept keyboard shortcuts to prevent browser handling
      handleKeyDown: (view, event) => {
        // Stop Cmd+B, Cmd+I, Cmd+U from propagating to browser
        if (event.metaKey || event.ctrlKey) {
          if (['b', 'i', 'u'].includes(event.key.toLowerCase())) {
            event.stopPropagation();
            // Let TipTap handle the actual formatting
            return false;
          }
        }
        return false;
      },
    },
  });

  // Clear optimistic value when parent catches up, and sync editor content
  useEffect(() => {
    // If we have an optimistic value and parent has caught up, clear it
    if (optimisticValue !== null && value === optimisticValue) {
      setOptimisticValue(null);
    }

    // Sync editor content when not editing and value changes from external source
    if (editor && !isEditing && optimisticValue === null) {
      const currentContent = editor.getHTML();
      if (currentContent !== value) {
        editor.commands.setContent(value || '');
      }
    }
  }, [value, editor, isEditing, optimisticValue]);

  const handleSave = useCallback(() => {
    if (editor) {
      const html = editor.getHTML();
      // Only trigger onChange if content actually changed
      // TipTap returns <p></p> for empty content
      const isEmpty = html === '<p></p>' || html === '';
      const cleanValue = isEmpty ? '' : html;

      if (cleanValue !== value) {
        // Set optimistic value to show immediately before parent state updates
        setOptimisticValue(cleanValue);
        onChange(cleanValue);
      }
    }
    setIsEditing(false);
  }, [editor, onChange, value]);

  const handleStartEditing = useCallback(() => {
    setIsEditing(true);
    // Focus editor after state update
    setTimeout(() => {
      editor?.commands.focus('end');
    }, 0);
  }, [editor]);

  // Handle clicks outside the editor container to save
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleSave();
      }
    };

    // Use mousedown to catch the event before blur
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, handleSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Reset content and close
        editor?.commands.setContent(value || '');
        setIsEditing(false);
      } else if (e.key === 'Enter' && e.metaKey) {
        e.preventDefault();
        handleSave();
      }
    },
    [editor, value, handleSave]
  );

  // Render mode - show formatted content
  if (!isEditing) {
    // Use optimistic value if we just saved and parent hasn't caught up yet
    const displayValue = optimisticValue ?? value;
    const isEmpty = !displayValue || displayValue === '<p></p>';
    const shouldTruncate = needsTruncation && !isExpanded && maxCollapsedHeight > 0;

    return (
      <div className={`${styles.richEditableFieldWrapper} ${className || ''}`}>
        <div
          className={`${styles.richEditableField} ${isEmpty ? styles.richEditableFieldEmpty : ''}`}
          onClick={handleStartEditing}
        >
          {isEmpty ? (
            <span className={styles.placeholder}>{placeholder}</span>
          ) : (
            <div
              ref={contentRef}
              className={`${styles.renderedContent} ${shouldTruncate ? styles.truncated : ''}`}
              style={shouldTruncate ? { maxHeight: maxCollapsedHeight } : undefined}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(displayValue) }}
            />
          )}
          <Pencil size={14} className={styles.editIcon} />
        </div>
        {needsTruncation && maxCollapsedHeight > 0 && (
          <button
            type="button"
            className={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <>
                <ChevronUp size={14} />
                Show less
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                Show more
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  // Edit mode - show TipTap editor
  return (
    <div
      ref={containerRef}
      className={`${styles.richEditableFieldEditing} ${className || ''}`}
      onKeyDown={handleKeyDown}
    >
      <Toolbar editor={editor} />
      <div className={styles.editorWrapper}>
        <EditorContent editor={editor} />
      </div>
      <div className={styles.editorHint}>
        <kbd>Esc</kbd> cancel · <kbd>⌘+Enter</kbd> save · click outside to save
      </div>
    </div>
  );
}
