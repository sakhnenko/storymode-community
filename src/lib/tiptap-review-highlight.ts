import { Mark, mergeAttributes } from '@tiptap/core';

export type ReviewIntent = 'sounds_wrong' | 'needs_ideas' | 'mark_for_review';

export interface ReviewHighlightAttrs {
  id: string;
  intent: ReviewIntent;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    reviewHighlight: {
      setReviewHighlight: (attrs: ReviewHighlightAttrs) => ReturnType;
      unsetReviewHighlight: (id?: string) => ReturnType;
    };
  }
}

export const ReviewHighlight = Mark.create<{ HTMLAttributes: Record<string, unknown> }>({
  name: 'reviewHighlight',
  inclusive: false,
  exitable: true,
  // Don't serialize through markdown — we re-apply marks on mount from saved quotes.
  excludes: '',

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-review-id'), renderHTML: (a) => ({ 'data-review-id': a.id }) },
      intent: {
        default: 'mark_for_review',
        parseHTML: (el) => el.getAttribute('data-review-intent') || 'mark_for_review',
        renderHTML: (a) => ({ 'data-review-intent': a.intent }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-review-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'review-hl' }), 0];
  },

  addCommands() {
    return {
      setReviewHighlight: (attrs) => ({ commands }) => commands.setMark(this.name, attrs),
      unsetReviewHighlight: (id) => ({ tr, state, dispatch }) => {
        const markType = state.schema.marks[this.name];
        if (!markType) return false;
        let changed = false;
        state.doc.descendants((node, pos) => {
          if (!node.isText) return;
          node.marks.forEach((m) => {
            if (m.type === markType && (!id || m.attrs.id === id)) {
              tr.removeMark(pos, pos + node.nodeSize, markType);
              changed = true;
            }
          });
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      },
    };
  },
});

/**
 * Build a flat character buffer of the doc with a parallel array of ProseMirror
 * positions so we can locate an exact quote and map it back to doc positions.
 */
function buildTextBuffer(editor: any): { text: string; map: number[] } {
  let text = '';
  const map: number[] = [];
  let needSep = false;
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.isText) {
      if (needSep && text.length > 0) { text += '\n'; map.push(-1); needSep = false; }
      const s = node.text || '';
      for (let i = 0; i < s.length; i++) { text += s[i]; map.push(pos + i); }
      return false;
    }
    if (node.isBlock) needSep = true;
    return true;
  });
  return { text, map };
}

function normalizeQuote(q: string): string {
  return q.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch);

/** Grow a range outward so it never starts or ends in the middle of a word. */
function snapToWords(
  hay: string,
  start: number,
  end: number,
  target?: string,
): { start: number; end: number } {
  let s = start;
  let e = end;
  while (s > 0 && isWordChar(hay[s - 1]) && isWordChar(hay[s])) s--;
  while (e < hay.length && isWordChar(hay[e]) && isWordChar(hay[e - 1])) e++;
  // Keep surrounding quote characters when the quoted target itself includes
  // them, so clicking a quote that shows "…" selects the real passage,
  // quotation marks included.
  const wantOpen = !target || /^["'“‘]/.test(target);
  const wantClose = !target || /["'”’]$/.test(target);
  while (e > s && /[\s"']/.test(hay[e - 1])) {
    if (wantClose && /["'”’]/.test(hay[e - 1])) break;
    e--;
  }
  while (s < e && /[\s"']/.test(hay[s])) {
    if (wantOpen && /["'“‘]/.test(hay[s])) break;
    s++;
  }
  return { start: s, end: e };
}

/** Locate a quote in the document, tolerant of smart quotes and whitespace. */
export function findQuoteRange(editor: any, quote: string): { from: number; to: number } | null {
  if (!editor || editor.isDestroyed) return null;
  const target = normalizeQuote(quote);
  if (target.length < 3) return null;
  const { text, map } = buildTextBuffer(editor);

  // Normalized haystack with an index back into the raw buffer.
  let hay = '';
  const hayMap: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (lastWasSpace || hay.length === 0) continue;
      hay += ' '; hayMap.push(i); lastWasSpace = true; continue;
    }
    lastWasSpace = false;
    const norm = ch === '“' || ch === '”' ? '"' : (ch === '‘' || ch === '’' ? "'" : ch);
    hay += norm; hayMap.push(i);
  }

  let idx = hay.indexOf(target);
  let len = target.length;
  if (idx === -1) {
    // Try without surrounding quote characters.
    const stripped = target.replace(/^["']|["']$/g, '');
    idx = hay.indexOf(stripped);
    len = stripped.length;
  }
  if (idx === -1) {
    // Fuzzy fallback: the AI often re-punctuates or re-tags the passage it is
    // quoting (adding dialogue tags, changing quote placement), so an exact
    // match fails. Anchor on the opening words, then extend to the closing
    // words so we still select the writer's real passage.
    const fuzzy = findFuzzyRange(hay, target);
    if (!fuzzy) return null;
    idx = fuzzy.start;
    len = fuzzy.end - fuzzy.start;
  }
  if (idx === -1 || len === 0) return null;

  const snapped = snapToWords(hay, idx, idx + len, target);
  idx = snapped.start;
  len = snapped.end - snapped.start;
  if (len <= 0) return null;

  const startRaw = hayMap[idx];
  const endRaw = hayMap[idx + len - 1];
  const startPos = map[startRaw];
  const endPos = map[endRaw];
  if (startPos == null || endPos == null || startPos < 0 || endPos < 0) return null;
  return { from: startPos, to: endPos + 1 };
}

/** Strip quote/punctuation noise so anchors match across re-punctuated text. */
function anchorWords(target: string): string[] {
  return target
    .replace(/["']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Find the region of `hay` that best corresponds to `target` by anchoring on
 * its first and last words. Tolerant of punctuation and dialogue-tag drift.
 */
function findFuzzyRange(hay: string, target: string): { start: number; end: number } | null {
  const words = anchorWords(target);
  if (words.length < 3) return null;

  // Match a phrase and report its real matched length, respecting word
  // boundaries so we never anchor in the middle of a longer word.
  const findPhrase = (phrase: string, from = 0): { index: number; length: number } | null => {
    if (!phrase) return null;
    const pattern = phrase
      .split(' ')
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('["\'\\s,.;:!?—–-]{0,4}');
    const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, 'iu');
    const m = re.exec(hay.slice(from));
    return m ? { index: from + m.index, length: m[0].length } : null;
  };

  let head: { index: number; length: number } | null = null;
  for (let headLen = Math.min(6, words.length); headLen >= 3; headLen--) {
    head = findPhrase(words.slice(0, headLen).join(' '));
    if (head) break;
  }
  if (!head) return null;
  const start = head.index;

  let end = -1;
  for (let tailLen = Math.min(6, words.length); tailLen >= 3; tailLen--) {
    const tail = words.slice(words.length - tailLen).join(' ');
    const at = findPhrase(tail, start);
    if (at) { end = at.index + at.length; break; }
  }
  if (end === -1 || end <= start) end = Math.min(hay.length, start + target.length);

  const snapped = snapToWords(hay, start, end);
  return snapped.end > snapped.start ? snapped : null;
}



/** Temporarily highlight a range, optionally scrolling it into view. */
export function flashRange(editor: any, from: number, to: number, ms = 2600, scroll = true) {
  if (!editor || editor.isDestroyed) return;
  const markType = editor.schema.marks.reviewHighlight;
  if (!markType) return;
  const id = `flash-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tr = editor.state.tr.addMark(from, to, markType.create({ id, intent: 'flash' }));
  editor.view.dispatch(tr.setMeta('addToHistory', false));
  if (scroll) try {
    const dom = editor.view.domAtPos(from)?.node as HTMLElement | Text | undefined;
    const el = dom && (dom as any).nodeType === 3 ? (dom as Text).parentElement : (dom as HTMLElement);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch { /* noop */ }
  window.setTimeout(() => {
    if (!editor || editor.isDestroyed) return;
    editor.commands.unsetReviewHighlight(id);
  }, ms);
}

/** Find a quote in the doc, scroll to it and flash it. Returns true if found. */
export function flashQuote(editor: any, quote: string, ms = 2600): boolean {
  const range = findQuoteRange(editor, quote);
  if (!range) return false;
  flashRange(editor, range.from, range.to, ms);
  return true;
}

/**
 * Find a quote, scroll to it and put the caret selection over it so the writer
 * lands back on the exact passage with the text actually selected.
 */
export function selectQuote(editor: any, quote: string): boolean {
  if (!editor || editor.isDestroyed) return false;
  const range = findQuoteRange(editor, quote);
  if (!range) return false;
  try {
    editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).scrollIntoView().run();
  } catch {
    return false;
  }
  try {
    const dom = editor.view.domAtPos(range.from)?.node as HTMLElement | Text | undefined;
    const el = dom && (dom as any).nodeType === 3 ? (dom as Text).parentElement : (dom as HTMLElement);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch { /* noop */ }
  flashRange(editor, range.from, range.to, 1600, false);
  return true;
}


/** Replace a quoted passage with new text, then flash the result. */
export function replaceQuote(editor: any, quote: string, replacement: string): boolean {
  if (!editor || editor.isDestroyed || editor.isEditable === false) return false;
  const range = findQuoteRange(editor, quote);
  if (!range) return false;
  const text = replacement.trim();
  if (!text) return false;
  editor
    .chain()
    .focus()
    .insertContentAt({ from: range.from, to: range.to }, text)
    .run();
  flashRange(editor, range.from, range.from + text.length, 2000);
  return true;
}