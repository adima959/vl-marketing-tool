'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from 'antd';
import { BoldOutlined, ItalicOutlined, OrderedListOutlined, UnorderedListOutlined, LinkOutlined } from '@ant-design/icons';
import styles from './RichTextEditor.module.css';

interface RichTextEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
}

export function RichTextEditor({
  content = '',
  onChange,
  placeholder = 'Write something...',
  editable = true,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: styles.link,
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  if (!editor) {
    return null;
  }

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div className={styles.editorContainer}>
      {editable && (
        <div className={styles.toolbar}>
          <Button
            type="text"
            size="small"
            icon={<BoldOutlined />}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={editor.isActive('bold') ? styles.activeButton : ''}
          />
          <Button
            type="text"
            size="small"
            icon={<ItalicOutlined />}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={editor.isActive('italic') ? styles.activeButton : ''}
          />
          <Button
            type="text"
            size="small"
            icon={<UnorderedListOutlined />}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={editor.isActive('bulletList') ? styles.activeButton : ''}
          />
          <Button
            type="text"
            size="small"
            icon={<OrderedListOutlined />}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={editor.isActive('orderedList') ? styles.activeButton : ''}
          />
          <Button
            type="text"
            size="small"
            icon={<LinkOutlined />}
            onClick={addLink}
            className={editor.isActive('link') ? styles.activeButton : ''}
          />
        </div>
      )}
      <EditorContent editor={editor} className={styles.editor} />
    </div>
  );
}
