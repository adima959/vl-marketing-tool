'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Highlight } from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Details, DetailsSummary, DetailsContent } from '@/components/ui/ToggleBlock';
import { SlashCommand } from '@/components/ui/SlashCommands';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading2,
  Heading3,
  Quote,
  Code,
  Highlighter,
  Link as LinkIcon,
  Loader2,
  Check,
} from 'lucide-react';
import styles from './NotionEditor.module.css';

export interface NotionEditorProps {
  value: string;
  /** Immediate change callback (every keystroke). Optional when using onSave. */
  onChange?: (value: string) => void;
  /** Async save function — NotionEditor handles debounce + "Saving…"/"Saved" indicator. */
  onSave?: (value: string) => Promise<void>;
  /** Debounce delay before onSave fires (ms). Default 1500. */
  debounceMs?: number;
  placeholder?: string;
  className?: string;
}

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

export function NotionEditor({
  value,
  onChange,
  onSave,
  debounceMs = 1500,
  placeholder = 'Type something...',
  className,
}: NotionEditorProps): React.ReactNode {
  const lastSavedRef = useRef(value);

  // ── Auto-save state ──
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
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
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Highlight,
      Table.configure({ resizable: true, cellMinWidth: 80 }),
      TableRow,
      TableCell,
      TableHeader,
      Details,
      DetailsSummary,
      DetailsContent,
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
              setSaveStatus('idle');
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

  // Cleanup timers on unmount
  useEffect(() => {
    const dTimer = debounceTimer;
    const sTimer = savedTimer;
    return () => {
      if (dTimer.current) clearTimeout(dTimer.current);
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
      {onSave && saveStatus !== 'idle' && (
        <span className={styles.saveStatus}>
          {saveStatus === 'saving' ? (
            <><Loader2 size={11} className={styles.saveSpinner} /> Saving...</>
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
          <BubbleButton
            onAction={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive('highlight')}
            title="Highlight"
          >
            <Highlighter size={14} />
          </BubbleButton>
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
