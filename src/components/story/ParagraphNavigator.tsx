import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { cn } from '@/lib/utils';

interface ParaItem {
  pos: number;
  preview: string;
}

interface Props {
  editor: Editor | null;
  scrollRef: React.RefObject<HTMLDivElement>;
  /** Bumps whenever the doc changes so the list re-derives. */
  revision: number;
}

const MAX_DOTS = 120;

function firstSentence(text: string) {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const m = trimmed.match(/^.*?[.!?…](?=\s|$)/);
  const s = (m ? m[0] : trimmed);
  return s.length > 140 ? s.slice(0, 140).trimEnd() + "…" : s;
}

const MIN_LINES = 4;

function estimateLineCount(editor: Editor, pos: number): number {
  try {
    const el = editor.view.nodeDOM(pos) as HTMLElement | null;
    if (!el) return 1;
    const target = el.nodeType === Node.TEXT_NODE ? el.parentElement : el;
    if (!target) return 1;
    const style = window.getComputedStyle(target);
    const lineHeight = parseFloat(style.lineHeight);
    const height = target.getBoundingClientRect().height;
    if (!lineHeight || !height || lineHeight <= 0) return 1;
    return Math.max(1, height / lineHeight);
  } catch {
    return 1;
  }
}

/**
 * Subtle left-edge paragraph rail: one hairline per paragraph that grows as
 * the pointer approaches, previews the first sentence on hover, and scrolls
 * the paragraph into view on click.
 */
export function ParagraphNavigator({ editor, scrollRef, revision }: Props) {
  const [items, setItems] = useState<ParaItem[]>([]);
  const [pointerY, setPointerY] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);
  const railRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const bumpVisibility = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), 2500);
    setVisible(true);
  }, []);

  const hideNow = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  // Fade the rail out after an initial idle period, then reappear on activity.
  useEffect(() => {
    timerRef.current = window.setTimeout(() => setVisible(false), 2500);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  // Derive paragraph list from the document. Only include paragraphs that
  // render to more than a few lines so the rail doesn't become crowded.
  useEffect(() => {
    if (!editor) { setItems([]); return; }
    const next: ParaItem[] = [];
    editor.state.doc.forEach((node, offset) => {
      if (!node.isTextblock) return;
      const text = node.textContent.trim();
      if (!text) return;
      if (estimateLineCount(editor, offset) < MIN_LINES) return;
      next.push({ pos: offset + 1, preview: firstSentence(text) });
    });
    setItems(next.slice(0, MAX_DOTS));
  }, [editor, revision]);

  // Track which paragraph is nearest the top of the viewport.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !editor || items.length === 0) return;
    let raf = 0;
    const onScroll = () => {
      bumpVisibility();
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const bounds = el.getBoundingClientRect();
        const anchor = bounds.top + bounds.height * 0.28;
        let idx = 0;
        for (let i = 0; i < items.length; i++) {
          try {
            const coords = editor.view.coordsAtPos(items[i].pos);
            if (coords.top <= anchor) idx = i; else break;
          } catch { /* position no longer valid */ }
        }
        setActive(idx);
      });
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [scrollRef, editor, items, bumpVisibility]);

  // Hide the rail while typing so it doesn't distract.
  useEffect(() => {
    const dom = editor?.view?.dom;
    if (!dom) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter' || e.key === 'Space' || e.key === ' ') {
        hideNow();
      }
    };
    dom.addEventListener('keydown', onKeyDown);
    return () => dom.removeEventListener('keydown', onKeyDown);
  }, [editor, hideNow]);

  const handleMove = useCallback((e: React.MouseEvent) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPointerY(e.clientY - rect.top);
  }, []);

  const jumpTo = useCallback((item: ParaItem) => {
    const el = scrollRef.current;
    if (!editor || !el) return;
    try {
      const coords = editor.view.coordsAtPos(item.pos);
      const rect = el.getBoundingClientRect();
      el.scrollBy({ top: coords.top - rect.top - rect.height * 0.22, behavior: 'smooth' });
    } catch { /* noop */ }
  }, [editor, scrollRef]);

  const rows = useMemo(() => items, [items]);
  if (rows.length < 3) return null;

  return (
    <div
      className="pointer-events-none absolute inset-y-0 left-0 w-14 z-50"
      onMouseEnter={bumpVisibility}
      onMouseMove={bumpVisibility}
      onMouseLeave={() => {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setVisible(false), 900);
      }}
    >
      <div
        ref={railRef}
        onMouseMove={handleMove}
        onMouseLeave={() => { setPointerY(null); setHovered(null); }}
        className="paragraph-rail group/rail pointer-events-auto absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-start justify-center gap-[3px] py-4 pl-1 pr-2"
        aria-label="Paragraph navigator"
        onMouseEnter={bumpVisibility}
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.45s ease',
        }}
      >
        {rows.map((item, i) => {
          const center = i * 7 + 16;
          const dist = pointerY === null ? 999 : Math.abs(pointerY - center);
          // Tight gaussian falloff: only the line directly under the pointer blooms.
          const prox = pointerY === null ? 0 : Math.exp(-Math.pow(dist / 24, 2));
          const isActive = i === active;
          const isHovered = i === hovered;
          const width = 5 + prox * 14 + (isActive ? 4 : 0);
          const opacity = 0.08 + prox * 0.82 + (isActive ? 0.35 : 0) + (isHovered ? 0.18 : 0);
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              onClick={() => jumpTo(item)}
              aria-label={item.preview}
              className="relative flex h-[4px] items-center"
            >
              <span
                className={cn('block h-[2px] rounded-full transition-all duration-200 ease-out')}
                style={{
                  width,
                  opacity: Math.min(1, opacity),
                  backgroundColor: 'hsl(var(--notepad-fg, var(--foreground)))',
                }}
              />
              {hovered === i && (
                <span
                  className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 z-40 w-[24rem] max-w-[24rem] rounded-lg px-3.5 py-2.5 text-sm font-medium leading-snug shadow-xl ring-1 ring-black/10"
                  style={{
                    backgroundColor: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                >
                  {item.preview}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
