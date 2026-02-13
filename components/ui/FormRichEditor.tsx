'use client';

import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
} from 'lucide-react';
import styles from './FormRichEditor.module.css';

interface FormRichEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
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
        onAction();
      }}
      className={`${styles.toolbarButton} ${isActive ? styles.toolbarButtonActive : ''}`}
      title={title}
    >
      {children}
    </button>
  );
}

export function FormRichEditor({ value, onChange, placeholder = 'Write something...' }: FormRichEditorProps) {
  // Ref to always have the latest onChange — avoids stale closure in TipTap's onUpdate
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Memoize extensions to prevent re-registration warnings
  const extensions = useMemo(
    () => [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false }),
      Placeholder.configure({ placeholder }),
      Underline,
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    content: value || '',
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const isEmpty = html === '<p></p>' || html === '';
      onChangeRef.current?.(isEmpty ? '' : html);
    },
  });

  // Clean up editor instance on unmount
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const normalized = value || '';
    // Only update if the external value meaningfully differs
    if (current !== normalized && !(current === '<p></p>' && normalized === '')) {
      editor.commands.setContent(normalized);
    }
  }, [value, editor]);

  const tb = useCallback(
    (action: () => boolean, active: string) => ({
      onAction: () => { if (editor) action(); },
      isActive: editor?.isActive(active) ?? false,
    }),
    [editor],
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.toolbar} onMouseDown={(e) => e.preventDefault()}>
        <ToolbarButton {...tb(() => editor!.chain().focus().toggleBold().run(), 'bold')} title="Bold">
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton {...tb(() => editor!.chain().focus().toggleItalic().run(), 'italic')} title="Italic">
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton {...tb(() => editor!.chain().focus().toggleUnderline().run(), 'underline')} title="Underline">
          <UnderlineIcon size={14} />
        </ToolbarButton>
        <ToolbarButton {...tb(() => editor!.chain().focus().toggleStrike().run(), 'strike')} title="Strikethrough">
          <Strikethrough size={14} />
        </ToolbarButton>
        <div className={styles.toolbarDivider} />
        <ToolbarButton {...tb(() => editor!.chain().focus().toggleBulletList().run(), 'bulletList')} title="Bullet List">
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton {...tb(() => editor!.chain().focus().toggleOrderedList().run(), 'orderedList')} title="Numbered List">
          <ListOrdered size={14} />
        </ToolbarButton>
      </div>
      <div className={styles.editor}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
