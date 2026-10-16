import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const NBSP = '\u00A0';
// Each group of this many leading non-breaking spaces = one indent level.
const UNIT = 4;
const EM_PER_UNIT = 2;

/**
 * Renders paragraphs that start with non-breaking spaces as fully indented
 * blocks (every line shifted, not just the first). The NBSPs stay in the
 * document so the indent survives markdown round-trips, but they're visually
 * collapsed and replaced by a left margin on the whole block.
 */
export const BlockIndent = Extension.create({
  name: 'blockIndent',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockIndent'),
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return;
              const text = node.textContent;
              const lead = text.match(/^\u00A0+/)?.[0];
              if (!lead) return;
              const levels = Math.max(1, Math.round(lead.length / UNIT));
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  style: `margin-left:${levels * EM_PER_UNIT}em`,
                }),
                Decoration.inline(pos + 1, pos + 1 + lead.length, {
                  class: 'md-block-indent-lead',
                }),
              );
            });
            return decos.length ? DecorationSet.create(state.doc, decos) : null;
          },
        },
        // The leading NBSPs are rendered at font-size 0, so a caret placed
        // inside them is invisible. Snap any collapsed selection that lands
        // in that zone to just after the indent marker.
        appendTransaction(_trs, _old, newState) {
          const { selection } = newState;
          if (!selection.empty) return null;
          const $pos = selection.$from;
          const parent = $pos.parent;
          if (!parent.isTextblock) return null;
          const lead = parent.textContent.match(/^\u00A0+/)?.[0];
          if (!lead) return null;
          const offset = $pos.parentOffset;
          if (offset >= lead.length) return null;
          // Caret at the very paragraph start (e.g. mouse click, Home key):
          // snap forward past the invisible indent marker.
          if (offset === 0) {
            const target = $pos.start() + lead.length;
            return newState.tr.setSelection(
              TextSelection.near(newState.doc.resolve(target), 1),
            );
          }
          // Caret stepped backward into the marker (ArrowLeft from the first
          // visible letter): let it escape to the end of the previous block
          // instead of trapping it inside the indented paragraph.
          return newState.tr.setSelection(
            TextSelection.near(newState.doc.resolve($pos.before()), -1),
          );
        },
      }),
    ];
  },
});

export const BLOCK_INDENT_NBSP = NBSP.repeat(UNIT);
