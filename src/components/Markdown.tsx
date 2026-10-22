import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { toggleCheckboxInContent } from '@/lib/markdown-checkbox';
import { MARKDOWN_PLUGINS } from '@/lib/markdown';

// The one Markdown renderer for the app's screens: AI editor answers,
// notebook text and its previews, scans. Same parser and rules everywhere,
// shared with exports (lib/markdown); the variants only add extras.

const QUOTE = /(["“])([^"”]{1,400}?)(["”])/g;
const CHECKBOX = /\[( |x|X)\]/g;

function highlightQuotes(text: string, onQuoteClick: (quote: string) => void, title?: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(QUOTE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const inner = m[2];
    parts.push(
      <span
        key={m.index}
        role="button"
        tabIndex={0}
        title={title}
        onClick={() => onQuoteClick(inner)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onQuoteClick(inner); } }}
        className="cursor-pointer rounded-sm bg-primary/15 px-1 py-px font-[450] italic text-foreground transition-colors hover:bg-primary/30"
      >
        “{inner}”
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Highlights quotes in an element's text children, including inside paragraphs nested in list items. */
function withQuotes(children: ReactNode, onQuoteClick: (quote: string) => void, title?: string): ReactNode {
  return Children.map(children, child => {
    if (typeof child === 'string') return highlightQuotes(child, onQuoteClick, title);
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined && typeof child.type === 'string') {
      return cloneElement(child, {}, withQuotes(child.props.children, onQuoteClick, title));
    }
    return child;
  });
}

type TextTag = 'p' | 'li' | 'em' | 'strong' | 'td' | 'th';

export function Markdown({ content, variant = 'chat', className, onQuoteClick, quoteTitle, onContentChange, readOnly = false }: {
  content: string;
  /**
   * `chat`: what the AI editor writes. `notebook`: an author's notes, with
   * links in the notebook's link colour and "[ ]" / "[x]" as checkboxes.
   */
  variant?: 'chat' | 'notebook';
  className?: string;
  /** When given, quoted passages become links to them in the chapter. */
  onQuoteClick?: (quote: string) => void;
  quoteTitle?: string;
  /** Notebook only: ticking a checkbox calls this with the updated text. */
  onContentChange?: (content: string) => void;
  readOnly?: boolean;
}) {
  const notebook = variant === 'notebook';
  const canToggle = notebook && !!onContentChange && !readOnly;
  // Checkboxes are numbered in the order they render, which is their order in the text.
  let checkboxes = 0;
  const checkbox = (checked: boolean) => {
    const index = checkboxes++;
    return (
      <input
        key={`checkbox-${index}`}
        type="checkbox"
        checked={checked}
        disabled={!canToggle}
        onChange={(e) => { e.stopPropagation(); if (canToggle) onContentChange!(toggleCheckboxInContent(content, index)); }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="mr-1 cursor-pointer align-middle"
      />
    );
  };
  const withCheckboxes = (children: ReactNode) => Children.map(children, child => {
    if (typeof child !== 'string') return child;
    const parts: ReactNode[] = [];
    let last = 0;
    for (const m of child.matchAll(CHECKBOX)) {
      if (m.index! > last) parts.push(child.slice(last, m.index));
      parts.push(checkbox(m[1] !== ' '));
      last = m.index! + m[0].length;
    }
    if (last < child.length) parts.push(child.slice(last));
    return parts;
  });
  const text = (Tag: TextTag) => ({ children, node: _node, ...props }: { children?: ReactNode; node?: unknown }) => {
    let out = children;
    if (notebook && (Tag === 'p' || Tag === 'li')) out = withCheckboxes(out);
    if (onQuoteClick) out = withQuotes(out, onQuoteClick, quoteTitle);
    return <Tag {...props}>{out}</Tag>;
  };
  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
        className="underline-offset-2 hover:underline" style={notebook ? { color: 'hsl(var(--notepad-link))' } : undefined}>
        {children}
      </a>
    ),
    p: text('p'), li: text('li'), em: text('em'), strong: text('strong'), td: text('td'), th: text('th'),
    // GitHub task lists ("- [ ] item") arrive as inputs.
    ...(notebook ? { input: ({ checked }: { checked?: boolean }) => checkbox(!!checked) } : {}),
  };
  const body = <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} components={components}>{content}</ReactMarkdown>;
  return notebook && className === undefined ? body : <div className={className}>{body}</div>;
}
