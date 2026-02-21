'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Highlight } from '@tiptap/extension-highlight';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Details, DetailsSummary, DetailsContent } from '@/components/ui/ToggleBlock';
import { Callout } from '@/components/ui/CalloutBlock';
import { DragHandle } from '@/components/ui/DragHandle';
import { SlashCommand } from '@/components/ui/SlashCommands';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Highlighter,
  Link as LinkIcon,
  Loader2,
  Check,
  Palette,
  RemoveFormatting,
} from 'lucide-react';
import styles from './NotionEditor.module.css';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface NotionEditorProps {
  value: string;
  /** Immediate change callback (every keystroke). Optional when using onSave. */
  onChange?: (value: string) => void;
  /** Async save function — NotionEditor handles debounce + "Saving…"/"Saved" indicator. */
  onSave?: (value: string) => Promise<void>;
  /** Debounce delay before onSave fires (ms). Default 1500. */
  debounceMs?: number;
  /** Called whenever save status changes. Useful for showing status in a parent component. */
  onStatusChange?: (status: SaveStatus) => void;
  /** Hide the built-in status indicator (when parent renders it elsewhere). */
  hideStatusIndicator?: boolean;
  placeholder?: string;
  className?: string;
}

const TEXT_COLORS = [
  { label: 'Default', value: '' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Green', value: '#059669' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Gray', value: '#6b7280' },
];

const HIGHLIGHT_COLORS = [
  { label: 'None', value: '' },
  { label: 'Yellow', value: '#fef08a' },
  { label: 'Green', value: '#bbf7d0' },
  { label: 'Blue', value: '#bfdbfe' },
  { label: 'Pink', value: '#fbcfe8' },
  { label: 'Orange', value: '#fed7aa' },
  { label: 'Purple', value: '#ddd6fe' },
];

function BubbleButton({
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
      className={`${styles.bubbleButton} ${isActive ? styles.bubbleButtonActive : ''}`}
      title={title}
    >
      {children}
    </button>
  );
}

function ColorPickerDropdown({
  colors,
  activeColor,
  onSelect,
  icon,
  title,
}: {
  colors: { label: string; value: string }[];
  activeColor: string | undefined;
  onSelect: (color: string) => void;
  icon: React.ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={styles.colorPickerWrap}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`${styles.bubbleButton} ${activeColor ? styles.bubbleButtonActive : ''}`}
        title={title}
      >
        {icon}
        {activeColor && <span className={styles.colorDot} style={{ background: activeColor }} />}
      </button>
      {open && (
        <div className={styles.colorPickerGrid}>
          {colors.map((c) => (
            <button
              key={c.label}
              type="button"
              className={`${styles.colorSwatch} ${(activeColor || '') === c.value ? styles.colorSwatchActive : ''}`}
              title={c.label}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(c.value);
                setOpen(false);
              }}
            >
              {c.value ? (
                <span style={{ background: c.value }} className={styles.colorSwatchInner} />
              ) : (
                <RemoveFormatting size={12} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotionEditor({
  value,
  onChange,
  onSave,
  debounceMs = 1500,
  onStatusChange,
  hideStatusIndicator = false,
  placeholder = 'Type something...',
  className,
}: NotionEditorProps): React.ReactNode {
  const lastSavedRef = useRef(value);

  // ── Auto-save state ──
  const [saveStatus, setSaveStatusRaw] = useState<SaveStatus>('idle');
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; }, [onStatusChange]);
  const setSaveStatus = useCallback((status: SaveStatus) => {
    setSaveStatusRaw(status);
    onStatusChangeRef.current?.(status);
  }, []);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const savedTimer = useRef<NodeJS.Timeout | null>(null);
  const latestValueRef = useRef(value);

  // Stable refs so the onUpdate closure always sees the latest callbacks
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const debounceMsRef = useRef(debounceMs);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { debounceMsRef.current = debounceMs; }, [debounceMs]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Table.configure({ resizable: true, cellMinWidth: 80 }),
      TableRow,
      TableCell,
      TableHeader,
      Details,
      DetailsSummary,
      DetailsContent,
      Callout,
      DragHandle,
      SlashCommand,
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: styles.editorContent,
      },
      handleKeyDown: (_view, event) => {
        if (event.metaKey || event.ctrlKey) {
          if (['b', 'i', 'u'].includes(event.key.toLowerCase())) {
            event.stopPropagation();
            return false;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const isEmpty = html === '<p></p>' || html === '';
      const cleanValue = isEmpty ? '' : html;
      if (cleanValue !== lastSavedRef.current) {
        lastSavedRef.current = cleanValue;
        latestValueRef.current = cleanValue;
        onChangeRef.current?.(cleanValue);

        // Auto-save with debounce
        if (onSaveRef.current) {
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          if (savedTimer.current) clearTimeout(savedTimer.current);
          setSaveStatus('idle');
          debounceTimer.current = setTimeout(async () => {
            setSaveStatus('saving');
            try {
              await onSaveRef.current!(latestValueRef.current);
              setSaveStatus('saved');
              savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
            } catch {
              setSaveStatus('error');
              savedTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
            }
          }, debounceMsRef.current);
        }
      }
    },
  });

  // Sync external value changes (e.g. from other clients, message switch)
  useEffect(() => {
    if (!editor) return;
    if (!editor.isFocused) {
      const currentContent = editor.getHTML();
      if (currentContent !== value && value !== lastSavedRef.current) {
        editor.commands.setContent(value || '');
        lastSavedRef.current = value;
        // Reset save status on external change
        setSaveStatus('idle');
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        if (savedTimer.current) clearTimeout(savedTimer.current);
      }
    }
  }, [value, editor]);

  // Flush pending save on unmount — don't lose data when accordion closes
  useEffect(() => {
    const dTimer = debounceTimer;
    const sTimer = savedTimer;
    return () => {
      if (dTimer.current) {
        clearTimeout(dTimer.current);
        // Fire save immediately with latest value
        if (onSaveRef.current) {
          onSaveRef.current(latestValueRef.current).catch(() => {});
        }
      }
      if (sTimer.current) clearTimeout(sTimer.current);
    };
  }, []);

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Enter URL:');
    if (url) {
      const trimmed = url.trim();
      if (/^(javascript|data|vbscript):/i.test(trimmed)) return;
      editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    }
  }, [editor]);

  return (
    <div className={`${styles.notionEditor} ${className || ''}`}>
      {onSave && saveStatus !== 'idle' && !hideStatusIndicator && (
        <span className={styles.saveStatus}>
          {saveStatus === 'saving' ? (
            <><Loader2 size={11} className={styles.saveSpinner} /> Saving...</>
          ) : saveStatus === 'error' ? (
            <>Failed to save</>
          ) : (
            <><Check size={11} /> Saved</>
          )}
        </span>
      )}
      {editor && (
        <BubbleMenu
          editor={editor}
          options={{
            placement: 'top',
            offset: 8,
          }}
          className={styles.bubbleMenu}
        >
          <BubbleButton
            onAction={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold"
          >
            <Bold size={14} />
          </BubbleButton>
          <BubbleButton
            onAction={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="Italic"
          >
            <Italic size={14} />
          </BubbleButton>
          <BubbleButton
            onAction={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            title="Underline"
          >
            <UnderlineIcon size={14} />
          </BubbleButton>
          <BubbleButton
            onAction={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            title="Strikethrough"
          >
            <Strikethrough size={14} />
          </BubbleButton>
          <div className={styles.bubbleDivider} />
          <BubbleButton
            onAction={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            isActive={editor.isActive('heading', { level: 1 })}
            title="Heading 1"
          >
            <Heading1 size={14} />
          </BubbleButton>
          <BubbleButton
            onAction={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <Heading2 size={14} />
          </BubbleButton>
          <BubbleButton
            onAction={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            <Heading3 size={14} />
          </BubbleButton>
          <BubbleButton
            onAction={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="Quote"
          >
            <Quote size={14} />
          </BubbleButton>
          <BubbleButton
            onAction={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
            title="Inline Code"
          >
            <Code size={14} />
          </BubbleButton>
          <div className={styles.bubbleDivider} />
          <ColorPickerDropdown
            colors={TEXT_COLORS}
            activeColor={editor.getAttributes('textStyle').color || ''}
            onSelect={(color) => {
              if (color) {
                editor.chain().focus().setColor(color).run();
              } else {
                editor.chain().focus().unsetColor().run();
              }
            }}
            icon={<Palette size={14} />}
            title="Text color"
          />
          <ColorPickerDropdown
            colors={HIGHLIGHT_COLORS}
            activeColor={editor.isActive('highlight') ? (editor.getAttributes('highlight').color || '#fef08a') : ''}
            onSelect={(color) => {
              if (color) {
                editor.chain().focus().toggleHighlight({ color }).run();
              } else {
                editor.chain().focus().unsetHighlight().run();
              }
            }}
            icon={<Highlighter size={14} />}
            title="Highlight color"
          />
          <div className={styles.bubbleDivider} />
          <BubbleButton
            onAction={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <List size={14} />
          </BubbleButton>
          <BubbleButton
            onAction={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered List"
          >
            <ListOrdered size={14} />
          </BubbleButton>
          <div className={styles.bubbleDivider} />
          <BubbleButton
            onAction={addLink}
            isActive={editor.isActive('link')}
            title="Link"
          >
            <LinkIcon size={14} />
          </BubbleButton>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
