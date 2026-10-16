import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { List, PhrasingContent, Root, RootContent } from 'mdast';

/**
 * How StoryMode reads Markdown, everywhere: GitHub-flavoured (tables, task
 * lists, strikethrough) with single line breaks kept. The on-screen renderer
 * (components/Markdown) and exports both use these.
 */
export const MARKDOWN_PLUGINS = [remarkGfm, remarkBreaks];

const processor = unified().use(remarkParse).use(MARKDOWN_PLUGINS);

/** Markdown as a syntax tree, read exactly as the screens read it. */
export function parseMarkdown(md: string): Root {
  return processor.runSync(processor.parse(md || '')) as Root;
}

/** A piece of inline text with its style; "\n" is a line break. */
export interface Run { text: string; bold: boolean; italic: boolean }

/** Simple layout blocks for page-based exports (PDF, Word, text). */
export type Block =
  | { kind: 'heading'; level: number; runs: Run[] }
  | { kind: 'paragraph'; runs: Run[] }
  | { kind: 'quote'; runs: Run[] }
  | { kind: 'list'; marker: string; depth: number; runs: Run[] }
  | { kind: 'hr' };

function runsOf(nodes: PhrasingContent[], style = { bold: false, italic: false }): Run[] {
  return nodes.flatMap((node): Run[] => {
    switch (node.type) {
      case 'text': return [{ text: node.value, ...style }];
      case 'inlineCode': return [{ text: node.value, ...style }];
      case 'break': return [{ text: '\n', ...style }];
      case 'strong': return runsOf(node.children, { ...style, bold: true });
      case 'emphasis': return runsOf(node.children, { ...style, italic: true });
      case 'delete': case 'link': case 'linkReference': return runsOf(node.children, style);
      default: return [];
    }
  }).filter(run => run.text.length > 0);
}

const join = (a: Run[], b: Run[]) => (a.length && b.length ? [...a, { text: '\n', bold: false, italic: false }, ...b] : [...a, ...b]);

function listBlocks(list: List, depth: number): Block[] {
  return list.children.flatMap((item, i) => {
    const box = item.checked === true ? '☑ ' : item.checked === false ? '☐ ' : '';
    const marker = list.ordered ? `${(list.start ?? 1) + i}.` : '•';
    // An item's paragraphs run on as lines; its task box leads the first one.
    let runs: Run[] = [];
    const nested: Block[] = [];
    for (const child of item.children) {
      if (child.type === 'paragraph') runs = join(runs, runsOf(child.children));
      else if (child.type === 'list') nested.push(...listBlocks(child, depth + 1));
      else nested.push(...blocksOf([child], depth + 1));
    }
    if (box) runs = [{ text: box, bold: false, italic: false }, ...runs];
    return [{ kind: 'list' as const, marker, depth, runs }, ...nested];
  });
}

function blocksOf(nodes: RootContent[], depth = 0): Block[] {
  return nodes.flatMap((node): Block[] => {
    switch (node.type) {
      case 'heading': return [{ kind: 'heading', level: node.depth, runs: runsOf(node.children) }];
      case 'paragraph': return [{ kind: 'paragraph', runs: runsOf(node.children) }];
      case 'blockquote':
        return blocksOf(node.children, depth).map(block => ('runs' in block ? { kind: 'quote' as const, runs: block.runs } : block));
      case 'list': return listBlocks(node, depth);
      case 'thematicBreak': return [{ kind: 'hr' }];
      case 'code': return [{ kind: 'paragraph', runs: node.value.split('\n').flatMap((line, i) => [
        ...(i ? [{ text: '\n', bold: false, italic: false }] : []), { text: line, bold: false, italic: false }]) }];
      case 'table':
        return node.children.map(row => ({ kind: 'paragraph' as const,
          runs: row.children.flatMap((cell, i) => [...(i ? [{ text: ' | ', bold: false, italic: false }] : []), ...runsOf(cell.children)]) }));
      default: return [];
    }
  }).filter(block => block.kind === 'hr' || block.runs.length > 0);
}

/** Markdown as layout blocks, from the same tree the screens draw. */
export function markdownBlocks(md: string): Block[] {
  return blocksOf(parseMarkdown(md).children);
}

/** Markdown as the text a reader sees: no marks or list markers, paragraphs apart. */
export function markdownText(md: string): string {
  return markdownBlocks(md).map(block => ('runs' in block ? block.runs.map(run => run.text).join('') : ''))
    .filter(Boolean).join('\n\n');
}

/** Blocks as plain text: paragraphs apart, line breaks kept, list items marked. */
export function blocksToText(blocks: Block[]): string {
  return blocks.map(block => {
    if (block.kind === 'hr') return '* * *';
    const text = block.runs.map(run => run.text).join('');
    if (block.kind === 'list') return `${'  '.repeat(block.depth)}${block.marker === '•' ? '-' : block.marker} ${text}`;
    return text;
  }).reduce((out, line, i) => {
    if (!i) return line;
    const tight = blocks[i].kind === 'list' && blocks[i - 1].kind === 'list';
    return `${out}${tight ? '\n' : '\n\n'}${line}`;
  }, '');
}

/** A run of text with the emphasis it should be shown with. */
export interface InlineSegment { text: string; bold?: boolean; italic?: boolean }

/**
 * Short chat text as plain and emphasized runs without the Markdown marks,
 * for text that is typed out letter by letter. Unmatched marks, arithmetic
 * and snake_case stay as written; a list item keeps its marker.
 */
export function parseInlineMarkdown(text: string): InlineSegment[] {
  const blocks = markdownBlocks(text);
  return blocks.flatMap((block, i): Run[] => {
    const gap = i ? [{ text: '\n\n', bold: false, italic: false }] : [];
    if (block.kind === 'hr') return [...gap, { text: '* * *', bold: false, italic: false }];
    const marker = block.kind === 'list' ? [{ text: `${block.marker === '•' ? '-' : block.marker} `, bold: false, italic: false }] : [];
    return [...gap, ...marker, ...block.runs];
  }).map(run => ({ text: run.text, ...(run.bold && { bold: true }), ...(run.italic && { italic: true }) }));
}
