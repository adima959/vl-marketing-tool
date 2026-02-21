import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';

/**
 * DragHandle — adds a grip handle to the left of top-level blocks.
 * Hovering near the left edge of a block reveals a ⠿ handle that
 * can be dragged to reorder blocks (native HTML5 drag & drop).
 */

const DRAG_HANDLE_KEY = new PluginKey('dragHandle');

// Top-level block types that should get a drag handle
const DRAGGABLE_TYPES = new Set([
  'paragraph', 'heading', 'bulletList', 'orderedList',
  'blockquote', 'codeBlock', 'table', 'details', 'callout',
  'horizontalRule', 'taskList',
]);

function buildDecorations(doc: PmNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.forEach((node, offset) => {
    if (DRAGGABLE_TYPES.has(node.type.name)) {
      decorations.push(
        Decoration.widget(offset, () => {
          const handle = document.createElement('div');
          handle.className = 'drag-handle';
          handle.contentEditable = 'false';
          handle.draggable = true;
          handle.setAttribute('data-drag-handle', '');
          handle.innerHTML = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/><circle cx="2" cy="7" r="1.5"/><circle cx="8" cy="7" r="1.5"/><circle cx="2" cy="12" r="1.5"/><circle cx="8" cy="12" r="1.5"/></svg>';
          return handle;
        }, { side: -1 }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    const editorView = this.editor.view;

    return [
      new Plugin({
        key: DRAG_HANDLE_KEY,

        state: {
          init(_, { doc }) {
            return buildDecorations(doc);
          },
          apply(tr, oldDecorations) {
            if (tr.docChanged) {
              return buildDecorations(tr.doc);
            }
            return oldDecorations;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state) ?? DecorationSet.empty;
          },

          handleDOMEvents: {
            dragstart(view, event) {
              const target = event.target as HTMLElement;
              if (!target.closest?.('[data-drag-handle]')) return false;

              const handle = target.closest('[data-drag-handle]') as HTMLElement;
              // Find the position of the block this handle belongs to
              const blockEl = handle.nextElementSibling || handle.parentElement?.querySelector(':scope > :not([data-drag-handle])');
              if (!blockEl) return false;

              const pos = view.posAtDOM(blockEl, 0);
              const $pos = view.state.doc.resolve(pos);
              // Get the top-level node
              const depth = Math.min($pos.depth, 1);
              const start = $pos.before(depth);
              const end = $pos.after(depth);
              const node = $pos.node(depth);

              // Serialize the node to JSON for the drag data
              const slice = view.state.doc.slice(start, end);
              event.dataTransfer?.setData('application/prosemirror-node', JSON.stringify({
                start,
                end,
                nodeJSON: node.toJSON(),
              }));
              event.dataTransfer!.effectAllowed = 'move';

              // Visual feedback
              handle.classList.add('dragging');

              return false;
            },

            drop(view, event) {
              const data = event.dataTransfer?.getData('application/prosemirror-node');
              if (!data) return false;

              event.preventDefault();
              const { start: origStart, end: origEnd } = JSON.parse(data);

              // Find the drop target position
              const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (!dropPos) return false;

              const $drop = view.state.doc.resolve(dropPos.pos);
              // Resolve to top-level block boundary
              const dropDepth = Math.min($drop.depth, 1);
              let insertPos = $drop.before(dropDepth);

              // Determine if we're dropping above or below the target block
              const targetNode = view.nodeDOM(insertPos) as HTMLElement | null;
              if (targetNode) {
                const rect = targetNode.getBoundingClientRect();
                if (event.clientY > rect.top + rect.height / 2) {
                  insertPos = $drop.after(dropDepth);
                }
              }

              // Don't drop onto ourselves
              if (insertPos >= origStart && insertPos <= origEnd) return false;

              const { tr } = view.state;
              const slice = view.state.doc.slice(origStart, origEnd);

              // If dropping after the original position, delete first then insert
              if (insertPos > origStart) {
                tr.delete(origStart, origEnd);
                const adjustedPos = insertPos - (origEnd - origStart);
                tr.insert(adjustedPos, slice.content);
              } else {
                tr.insert(insertPos, slice.content);
                tr.delete(origStart + slice.content.size, origEnd + slice.content.size);
              }

              view.dispatch(tr);
              return true;
            },

            dragend(_view, event) {
              // Clean up dragging state
              const target = event.target as HTMLElement;
              target.closest?.('[data-drag-handle]')?.classList.remove('dragging');
              return false;
            },
          },
        },
      }),
    ];
  },
});
