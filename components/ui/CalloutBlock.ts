import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Callout block — colored alert/info boxes for TipTap.
 * Types: info (blue), warning (yellow), error (red), success (green)
 *
 * HTML: <div data-type="callout" data-callout-type="info">content</div>
 */

export type CalloutType = 'info' | 'warning' | 'error' | 'success';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { type?: CalloutType }) => ReturnType;
      toggleCallout: (attrs?: { type?: CalloutType }) => ReturnType;
      updateCalloutType: (type: CalloutType) => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info' as CalloutType,
        parseHTML: (element) => element.getAttribute('data-callout-type') || 'info',
        renderHTML: (attributes) => ({
          'data-callout-type': attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'callout' }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: 'callout',
            attrs: { type: attrs?.type || 'info' },
            content: [{ type: 'paragraph' }],
          });
        },

      toggleCallout:
        (attrs) =>
        ({ commands, state }) => {
          const { $from } = state.selection;
          // Check if we're already inside a callout
          for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type.name === 'callout') {
              // Lift the content out of the callout
              return commands.lift('callout');
            }
          }
          // Wrap in callout
          return commands.setCallout(attrs);
        },

      updateCalloutType:
        (type) =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          for (let d = $from.depth; d >= 0; d--) {
            const node = $from.node(d);
            if (node.type.name === 'callout') {
              if (dispatch) {
                const pos = $from.before(d);
                const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, type });
                dispatch(tr);
              }
              return true;
            }
          }
          return false;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at start of empty callout removes the callout
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty) return false;

        // Only if at the start of a block inside callout
        if ($from.parentOffset !== 0) return false;

        for (let d = $from.depth; d >= 0; d--) {
          if ($from.node(d).type.name === 'callout') {
            // If only one empty paragraph inside, lift it out
            const calloutNode = $from.node(d);
            if (calloutNode.childCount === 1 && calloutNode.firstChild?.textContent === '') {
              return editor.commands.lift('callout');
            }
            return false;
          }
        }
        return false;
      },
    };
  },
});
