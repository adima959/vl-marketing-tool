'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  useCallback,
} from 'react';
import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import tippy, { type Instance } from 'tippy.js';
import type { Editor, Range } from '@tiptap/core';
import {
  Type,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Table,
  Minus,
  Highlighter,
  ChevronRight,
} from 'lucide-react';
import styles from './SlashCommands.module.css';

/* ── Command definitions ─────────────────────────────── */

interface CommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
}

const COMMANDS: CommandItem[] = [
  {
    title: 'Text',
    description: 'Plain paragraph',
    icon: <Type size={16} />,
    command: (editor) => { editor.chain().focus().setParagraph().run(); },
  },
  {
    title: 'Heading 2',
    description: 'Large heading',
    icon: <Heading2 size={16} />,
    command: (editor) => { editor.chain().focus().toggleHeading({ level: 2 }).run(); },
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    icon: <Heading3 size={16} />,
    command: (editor) => { editor.chain().focus().toggleHeading({ level: 3 }).run(); },
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    icon: <List size={16} />,
    command: (editor) => { editor.chain().focus().toggleBulletList().run(); },
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    icon: <ListOrdered size={16} />,
    command: (editor) => { editor.chain().focus().toggleOrderedList().run(); },
  },
  {
    title: 'Toggle',
    description: 'Collapsible section',
    icon: <ChevronRight size={16} />,
    command: (editor) => { editor.chain().focus().setDetails().run(); },
  },
  {
    title: 'Quote',
    description: 'Block quote',
    icon: <Quote size={16} />,
    command: (editor) => { editor.chain().focus().toggleBlockquote().run(); },
  },
  {
    title: 'Code Block',
    description: 'Fenced code block',
    icon: <Code2 size={16} />,
    command: (editor) => { editor.chain().focus().toggleCodeBlock().run(); },
  },
  {
    title: 'Table',
    description: '3×3 table',
    icon: <Table size={16} />,
    command: (editor) => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); },
  },
  {
    title: 'Highlight',
    description: 'Highlight text',
    icon: <Highlighter size={16} />,
    command: (editor) => { editor.chain().focus().toggleHighlight().run(); },
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    icon: <Minus size={16} />,
    command: (editor) => { editor.chain().focus().setHorizontalRule().run(); },
  },
];

/* ── Dropdown list component ─────────────────────────── */

interface SlashCommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashCommandList = forwardRef<SlashCommandListRef, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return <div className={styles.slashMenu}><div className={styles.slashEmpty}>No results</div></div>;
    }

    return (
      <div className={styles.slashMenu}>
        {items.map((item, index) => (
          <button
            key={item.title}
            type="button"
            className={`${styles.slashItem} ${index === selectedIndex ? styles.slashItemActive : ''}`}
            onClick={() => selectItem(index)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span className={styles.slashIcon}>{item.icon}</span>
            <span className={styles.slashText}>
              <span className={styles.slashTitle}>{item.title}</span>
              <span className={styles.slashDesc}>{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    );
  },
);

SlashCommandList.displayName = 'SlashCommandList';

/* ── TipTap extension ────────────────────────────────── */

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: CommandItem }) => {
          // Delete the slash trigger text, then run the command
          editor.chain().focus().deleteRange(range).run();
          props.command(editor);
        },
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase();
          return COMMANDS.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q),
          );
        },
        render: () => {
          let component: ReactRenderer<SlashCommandListRef>;
          let popup: Instance[];

          return {
            onStart: (props: Record<string, unknown>) => {
              component = new ReactRenderer(SlashCommandList, {
                props,
                editor: props.editor as Editor,
              });

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },

            onUpdate: (props: Record<string, unknown>) => {
              component.updateProps(props);
              if (popup[0]) {
                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                });
              }
            },

            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') {
                popup[0]?.hide();
                return true;
              }
              return component.ref?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              popup[0]?.destroy();
              component.destroy();
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
