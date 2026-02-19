import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Toggle block — collapsible <details>/<summary> nodes for TipTap.
 * Usage: type /toggle or use the slash command to insert.
 *
 * ProseMirror intercepts native <details> toggle clicks, so we handle
 * open/close via a stored `open` attribute + a click-handler plugin.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    details: {
      setDetails: () => ReturnType;
    };
  }
}

export const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'detailsSummary detailsContent',
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => element.hasAttribute('open'),
        renderHTML: (attributes) => {
          if (attributes.open) return { open: 'true' };
          return {};
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'details' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['details', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setDetails:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: 'details',
            attrs: { open: true },
            content: [
              { type: 'detailsSummary', content: [{ type: 'text', text: 'Toggle heading' }] },
              { type: 'detailsContent', content: [{ type: 'paragraph' }] },
            ],
          });
        },
    };
  },

  addProseMirrorPlugins() {
    const detailsType = this.type;

    return [
      new Plugin({
        key: new PluginKey('detailsToggle'),
        props: {
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement;
            if (!target.closest('summary')) return false;

            // Walk up the document tree to find the parent details node
            const $pos = view.state.doc.resolve(pos);
            for (let d = $pos.depth; d >= 0; d--) {
              const node = $pos.node(d);
              if (node.type === detailsType) {
                const nodeStart = $pos.before(d);
                const tr = view.state.tr.setNodeMarkup(nodeStart, undefined, {
                  ...node.attrs,
                  open: !node.attrs.open,
                });
                view.dispatch(tr);
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});

export const DetailsSummary = Node.create({
  name: 'detailsSummary',
  group: '',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'summary' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['summary', mergeAttributes(HTMLAttributes), 0];
  },
});

export const DetailsContent = Node.create({
  name: 'detailsContent',
  group: '',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="details-content"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'details-content' }), 0];
  },
});
