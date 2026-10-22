/**
 * Story export helpers: convert chapter content (Markdown or HTML) into plain
 * text, Markdown, RTF, Word-compatible HTML (.doc) and a real downloadable PDF.
 */
import { blocksToText, markdownBlocks, type Block, type Run } from '@/lib/markdown';

export type ExportFormat = 'txt' | 'md' | 'rtf' | 'doc' | 'pdf';

export interface ExportChapter {
  title: string;
  content: string; // Markdown or HTML
}

export interface ExportOptions {
  /** Notepad font id selected in the editor theme (e.g. 'lora', 'mono'). */
  fontId?: string;
}

/** Map an editor font id to a real font family + jsPDF built-in family. */
export function resolveExportFont(fontId?: string): { family: string; pdf: 'times' | 'helvetica' | 'courier' } {
  switch (fontId) {
    case 'inter': return { family: 'Inter', pdf: 'helvetica' };
    case 'source-sans': return { family: 'Source Sans 3', pdf: 'helvetica' };
    case 'lato': return { family: 'Lato', pdf: 'helvetica' };
    case 'atkinson': return { family: 'Atkinson Hyperlegible', pdf: 'helvetica' };
    case 'serif': return { family: 'Libre Baskerville', pdf: 'times' };
    case 'lora': return { family: 'Lora', pdf: 'times' };
    case 'source': return { family: 'Source Serif 4', pdf: 'times' };
    case 'merriweather': return { family: 'Merriweather', pdf: 'times' };
    case 'garamond': return { family: 'EB Garamond', pdf: 'times' };
    case 'crimson': return { family: 'Crimson Pro', pdf: 'times' };
    case 'spectral': return { family: 'Spectral', pdf: 'times' };
    case 'vollkorn': return { family: 'Vollkorn', pdf: 'times' };
    case 'mono': return { family: 'IBM Plex Mono', pdf: 'courier' };
    case 'jetbrains': return { family: 'JetBrains Mono', pdf: 'courier' };
    default: return { family: 'Georgia', pdf: 'times' };
  }
}


/**
 * TTF sources for each editor font id, served straight from the Google Fonts
 * repository via jsDelivr. TTFs are used (instead of the woff2 files the CSS
 * API returns) because jsPDF can embed them directly with no wasm decoder.
 * Families that only ship variable fonts have no bold file; bold text is then
 * rendered with a synthetic stroke weight.
 */
const GF = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl';
type TtfSet = { normal: string; bold?: string; italic?: string; bolditalic?: string };
const GOOGLE_TTF: Record<string, TtfSet> = {
  inter: { normal: `${GF}/inter/Inter%5Bopsz,wght%5D.ttf`, italic: `${GF}/inter/Inter-Italic%5Bopsz,wght%5D.ttf` },
  'source-sans': { normal: `${GF}/sourcesans3/SourceSans3%5Bwght%5D.ttf`, italic: `${GF}/sourcesans3/SourceSans3-Italic%5Bwght%5D.ttf` },
  lato: {
    normal: `${GF}/lato/Lato-Regular.ttf`,
    bold: `${GF}/lato/Lato-Bold.ttf`,
    italic: `${GF}/lato/Lato-Italic.ttf`,
    bolditalic: `${GF}/lato/Lato-BoldItalic.ttf`,
  },
  atkinson: {
    normal: `${GF}/atkinsonhyperlegible/AtkinsonHyperlegible-Regular.ttf`,
    bold: `${GF}/atkinsonhyperlegible/AtkinsonHyperlegible-Bold.ttf`,
    italic: `${GF}/atkinsonhyperlegible/AtkinsonHyperlegible-Italic.ttf`,
    bolditalic: `${GF}/atkinsonhyperlegible/AtkinsonHyperlegible-BoldItalic.ttf`,
  },
  serif: { normal: `${GF}/librebaskerville/LibreBaskerville%5Bwght%5D.ttf`, italic: `${GF}/librebaskerville/LibreBaskerville-Italic%5Bwght%5D.ttf` },
  lora: { normal: `${GF}/lora/Lora%5Bwght%5D.ttf`, italic: `${GF}/lora/Lora-Italic%5Bwght%5D.ttf` },
  source: { normal: `${GF}/sourceserif4/SourceSerif4%5Bopsz,wght%5D.ttf`, italic: `${GF}/sourceserif4/SourceSerif4-Italic%5Bopsz,wght%5D.ttf` },
  merriweather: { normal: `${GF}/merriweather/Merriweather%5Bopsz,wdth,wght%5D.ttf`, italic: `${GF}/merriweather/Merriweather-Italic%5Bopsz,wdth,wght%5D.ttf` },
  garamond: { normal: `${GF}/ebgaramond/EBGaramond%5Bwght%5D.ttf`, italic: `${GF}/ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf` },
  crimson: { normal: `${GF}/crimsonpro/CrimsonPro%5Bwght%5D.ttf`, italic: `${GF}/crimsonpro/CrimsonPro-Italic%5Bwght%5D.ttf` },
  spectral: {
    normal: `${GF}/spectral/Spectral-Regular.ttf`,
    bold: `${GF}/spectral/Spectral-Bold.ttf`,
    italic: `${GF}/spectral/Spectral-Italic.ttf`,
    bolditalic: `${GF}/spectral/Spectral-BoldItalic.ttf`,
  },
  vollkorn: { normal: `${GF}/vollkorn/Vollkorn%5Bwght%5D.ttf`, italic: `${GF}/vollkorn/Vollkorn-Italic%5Bwght%5D.ttf` },
  mono: {
    normal: `${GF}/ibmplexmono/IBMPlexMono-Regular.ttf`,
    bold: `${GF}/ibmplexmono/IBMPlexMono-Bold.ttf`,
    italic: `${GF}/ibmplexmono/IBMPlexMono-Italic.ttf`,
    bolditalic: `${GF}/ibmplexmono/IBMPlexMono-BoldItalic.ttf`,
  },
  jetbrains: { normal: `${GF}/jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf`, italic: `${GF}/jetbrainsmono/JetBrainsMono-Italic%5Bwght%5D.ttf` },
};

const bufferToBinary = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
};

/**
 * Download the real theme font as a TTF and register it with jsPDF so PDFs use
 * the same typeface as the editor. Falls back to the built-in family when
 * anything fails (offline, CORS, ...).
 */
async function embedPdfFont(doc: any, fontId?: string): Promise<{ alias: string; styles: Set<string> } | null> {
  const set = fontId ? GOOGLE_TTF[fontId] : undefined;
  if (!set) return null;
  try {
    const alias = `theme-${fontId}`;
    const entries = (Object.entries(set) as [string, string][]).filter(([, url]) => !!url);
    const loaded = await Promise.all(
      entries.map(async ([styleName, url]) => {
        const res = await fetch(url);
        if (!res.ok) return null;
        return [styleName, await res.arrayBuffer()] as const;
      }),
    );
    const styles = new Set<string>();
    for (const item of loaded) {
      if (!item) continue;
      const [styleName, buf] = item;
      const file = `${alias}-${styleName}.ttf`;
      doc.addFileToVFS(file, bufferToBinary(buf));
      doc.addFont(file, alias, styleName);
      styles.add(styleName);
    }
    return styles.has('normal') ? { alias, styles } : null;
  } catch {
    return null;
  }
}

/** Chapter content can be stored as Markdown or HTML depending on the editor. */
export function looksLikeHtml(content: string): boolean {
  return /<(p|div|h[1-6]|ul|ol|li|blockquote|br|strong|em|pre)\b[^>]*>/i.test(content || '');
}

/** A chapter as layout blocks, read with the same Markdown rules as the screens. */
export function chapterBlocks(content: string): Block[] {
  const src = content || '';
  return markdownBlocks(looksLikeHtml(src) ? htmlToMarkdown(src) : normalizeMarkdown(src));
}

/** A chapter as plain text, for .txt and .rtf. */
export function chapterText(content: string): string {
  return blocksToText(chapterBlocks(content));
}

/**
 * Some editors store hard line breaks as a trailing backslash (pandoc style),
 * and blank lines as a lone "\". Those would otherwise leak into exports as
 * literal "\ \" characters, so convert them back into real line breaks.
 */
export function normalizeMarkdown(md: string): string {
  return (md || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => (line.trim() === '\\' ? '' : line.replace(/\s*\\+\s*$/, '')))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function htmlToDom(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return el;
}

/* -------------------------------- markdown -------------------------------- */

export function htmlToMarkdown(html: string): string {
  const root = htmlToDom(html);
  const walk = (node: Node, listPrefix?: string): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (!(node instanceof HTMLElement)) return '';
    const tag = node.tagName.toLowerCase();
    const kids = (prefix?: string) => Array.from(node.childNodes).map(n => walk(n, prefix)).join('');
    switch (tag) {
      case 'br': return '\n';
      case 'strong': case 'b': return `**${kids()}**`;
      case 'em': case 'i': return `*${kids()}*`;
      case 'u': return `_${kids()}_`;
      case 's': case 'del': return `~~${kids()}~~`;
      case 'code': return `\`${kids()}\``;
      case 'pre': return `\n\`\`\`\n${node.textContent || ''}\n\`\`\`\n\n`;
      case 'a': return `[${kids()}](${node.getAttribute('href') || ''})`;
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
        return `\n${'#'.repeat(Number(tag[1]))} ${kids().trim()}\n\n`;
      case 'blockquote':
        return `\n${kids().trim().split('\n').map(l => `> ${l}`).join('\n')}\n\n`;
      case 'ul': return `\n${kids('-')}\n`;
      case 'ol': {
        let i = 0;
        return `\n${Array.from(node.childNodes).map(n => {
          if (n instanceof HTMLElement && n.tagName.toLowerCase() === 'li') i += 1;
          return walk(n, `${i}.`);
        }).join('')}\n`;
      }
      case 'li': return `${listPrefix || '-'} ${kids().trim()}\n`;
      case 'p': case 'div': return `${kids().trim()}\n\n`;
      case 'hr': return `\n---\n\n`;
      default: return kids(listPrefix);
    }
  };
  return walk(root).replace(/\n{3,}/g, '\n\n').trim();
}

/* ----------------------------------- rtf ---------------------------------- */

function rtfEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/[\u0080-\uFFFF]/g, ch => `\\u${ch.charCodeAt(0)}?`);
}

export function buildRtf(docTitle: string, chapters: ExportChapter[], opts: ExportOptions = {}): string {
  const family = resolveExportFont(opts.fontId).family;
  const showDocTitle = !(chapters.length === 1 && (chapters[0].title || '').trim() === (docTitle || '').trim());
  const body = chapters.map(ch => {
    const heading = `{\\pard\\sa240\\b\\fs36 ${rtfEscape(ch.title || '')}\\b0\\par}`;
    const paras = chapterText(ch.content)
      .split(/\n{2,}/)
      .filter(Boolean)
      .map(p => `{\\pard\\sa180\\fs24 ${rtfEscape(p).replace(/\n/g, '\\line ')}\\par}`)
      .join('\n');
    return `${heading}\n${paras}`;
  }).join('\n{\\pard\\page\\par}\n');

  const head = showDocTitle ? `{\\pard\\qc\\b\\fs44 ${rtfEscape(docTitle)}\\b0\\par}\n` : '';
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 ${rtfEscape(family)};}}\n${head}${body}\n}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ----------------------------------- pdf ---------------------------------- */

/** Generate a real PDF file (no print dialog) and download it. */
export async function generatePdf(docTitle: string, chapters: ExportChapter[], filename: string, opts: ExportOptions = {}) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const embedded = await embedPdfFont(doc, opts.fontId);
  const pdfFamily = embedded?.alias || resolveExportFont(opts.fontId).pdf;
  const hasStyle = (name: string) => (embedded ? embedded.styles.has(name) : true);
  const showDocTitle = !(chapters.length === 1 && (chapters[0].title || '').trim() === (docTitle || '').trim());

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 62;
  const maxW = pageW - margin * 2;
  const bottom = pageH - margin;
  let y = margin;

  // Variable-font families ship a single weight file, so bold is emulated with
  // a thin outline stroke on top of the fill.
  let fauxBold = false;
  const style = (bold: boolean, italic: boolean) => {
    let name = bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal';
    if (!hasStyle(name)) {
      const fallback = italic && hasStyle('italic') ? 'italic' : 'normal';
      name = fallback;
      fauxBold = bold;
    } else {
      fauxBold = false;
    }
    doc.setFont(pdfFamily, name);
  };
  const drawText = (text: string, x: number, yy: number, size: number) => {
    if (fauxBold) {
      doc.setLineWidth(size * 0.026);
      doc.setDrawColor(0);
      doc.text(text, x, yy, { renderingMode: 'fillThenStroke' });
      doc.setLineWidth(0.2);
    } else {
      doc.text(text, x, yy);
    }
  };

  const newPage = () => { doc.addPage(); y = margin; };
  const ensure = (h: number) => { if (y + h > bottom) newPage(); };

  /** Word-wrap a set of styled runs. */
  const writeRuns = (runs: Run[], opts: { size: number; lineHeight: number; indent?: number; forceItalic?: boolean; forceBold?: boolean }) => {
    const indent = opts.indent || 0;
    const width = maxW - indent;
    doc.setFontSize(opts.size);
    let x = margin + indent;
    ensure(opts.lineHeight);
    for (const run of runs) {
      if (run.text === '\n') {
        y += opts.lineHeight;
        ensure(opts.lineHeight);
        x = margin + indent;
        continue;
      }
      const bold = opts.forceBold || run.bold;
      const italic = opts.forceItalic || run.italic;
      style(bold, italic);
      const words = run.text.split(/(\s+)/).filter(w => w !== '');
      for (const word of words) {
        const w = doc.getTextWidth(word);
        if (/^\s+$/.test(word)) {
          if (x > margin + indent) x += w;
          continue;
        }
        if (x + w > margin + indent + width && x > margin + indent) {
          y += opts.lineHeight;
          ensure(opts.lineHeight);
          x = margin + indent;
        }
        drawText(word, x, y, opts.size);
        x += w;
      }
    }
    y += opts.lineHeight;
  };

  // Title page header (skipped when it would duplicate the single chapter title)
  if (showDocTitle) {
    doc.setFontSize(26);
    style(true, false);
    const titleLines = doc.splitTextToSize(docTitle || '', maxW) as string[];
    for (const line of titleLines) {
      ensure(32);
      if (fauxBold) {
        doc.setLineWidth(26 * 0.026);
        doc.text(line, pageW / 2, y + 18, { align: 'center', renderingMode: 'fillThenStroke' });
        doc.setLineWidth(0.2);
      } else {
        doc.text(line, pageW / 2, y + 18, { align: 'center' });
      }
      y += 32;
    }
    y += 18;
  }

  chapters.forEach((ch, i) => {
    if (i > 0) newPage();
    if (ch.title) {
      ensure(34);
      writeRuns([{ text: ch.title, bold: true, italic: false }], { size: 18, lineHeight: 24 });
      y += 10;
    }
    for (const block of chapterBlocks(ch.content)) {
      switch (block.kind) {
        case 'heading':
          y += 8;
          writeRuns(block.runs, { size: Math.max(12, 20 - block.level * 2), lineHeight: 22, forceBold: true });
          y += 4;
          break;
        case 'quote':
          writeRuns(block.runs, { size: 12, lineHeight: 18, indent: 24, forceItalic: true });
          y += 6;
          break;
        case 'list':
          writeRuns(
            [{ text: `${block.marker} `, bold: false, italic: false }, ...block.runs],
            { size: 12, lineHeight: 18, indent: 18 * (block.depth + 1) },
          );
          break;
        case 'hr':
          ensure(20);
          doc.setDrawColor(180);
          doc.line(margin, y, pageW - margin, y);
          y += 16;
          break;
        default:
          writeRuns(block.runs, { size: 12, lineHeight: 18 });
          y += 8;
      }
    }
  });

  // Page numbers
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setFont(pdfFamily, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(String(p), pageW / 2, pageH - 30, { align: 'center' });
    doc.setTextColor(0);
  }

  doc.save(filename);
  return true;
}

/* --------------------------------- download -------------------------------- */

/** Generate a real .docx file (OOXML) so Word / Pages / Docs can open it. */
export async function generateDocx(docTitle: string, chapters: ExportChapter[], filename: string, opts: ExportOptions = {}) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, PageBreak } = await import('docx');
  const family = resolveExportFont(opts.fontId).family;

  // Embed the real theme TTF so Word/Pages render the editor typeface even when
  // the font is not installed locally. Falls back silently when unavailable.
  let embedded: { name: string; data: any }[] = [];
  const ttf = opts.fontId ? GOOGLE_TTF[opts.fontId] : undefined;
  if (ttf?.normal) {
    try {
      const res = await fetch(ttf.normal);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        embedded = [{ name: family, data: buf }];
      }
    } catch {
      embedded = [];
    }
  }

  const BODY_SPACING = { after: 220, line: 340, lineRule: 'auto' as const };
  const showDocTitle = !(chapters.length === 1 && (chapters[0].title || '').trim() === (docTitle || '').trim());

  const runsFor = (runs: Run[], o?: { italic?: boolean; bold?: boolean; size?: number }) => runs.map(r => (r.text === '\n'
    ? new TextRun({ break: 1, font: family })
    : new TextRun({ text: r.text, font: family, bold: r.bold || o?.bold, italics: r.italic || o?.italic, size: o?.size })));

  const children: InstanceType<typeof Paragraph>[] = showDocTitle
    ? [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [new TextRun({ text: docTitle || '', font: family, bold: true, size: 44, color: '000000' })],
      })]
    : [];

  chapters.forEach((ch, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    if (ch.title) {
      children.push(new Paragraph({
        spacing: { before: 120, after: 240 },
        children: [new TextRun({ text: ch.title, font: family, bold: true, size: 32, color: '000000' })],
      }));
    }
    for (const block of chapterBlocks(ch.content)) {
      switch (block.kind) {
        case 'heading':
          children.push(new Paragraph({
            spacing: { before: 240, after: 160 },
            children: runsFor(block.runs, { bold: true, size: Math.max(24, 34 - block.level * 3) }),
          }));
          break;
        case 'quote':
          children.push(new Paragraph({
            indent: { left: 720 },
            spacing: BODY_SPACING,
            children: runsFor(block.runs, { italic: true }),
          }));
          break;
        case 'list':
          children.push(new Paragraph({
            indent: { left: 720 * (block.depth + 1), hanging: 360 },
            spacing: { after: 140, line: 320, lineRule: 'auto' },
            children: [new TextRun({ text: `${block.marker} `, font: family }), ...runsFor(block.runs)],
          }));
          break;
        case 'hr':
          children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: '* * *', font: family })], alignment: AlignmentType.CENTER }));
          break;
        default:
          children.push(new Paragraph({ spacing: BODY_SPACING, children: runsFor(block.runs) }));
      }
    }
  });

  const doc = new Document({
    ...(embedded.length ? { fonts: embedded as any } : {}),
    styles: {
      default: {
        document: {
          run: { font: family, size: 24, color: '000000' },
          paragraph: { spacing: BODY_SPACING },
        },
      },
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          quickFormat: true,
          run: { font: family, size: 24, color: '000000' },
          paragraph: { spacing: BODY_SPACING },
        },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string): string {
  return (name || 'story').replace(/[^\w\d\-. ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'story';
}

export async function exportChapters(
  format: ExportFormat,
  docTitle: string,
  chapters: ExportChapter[],
  opts: ExportOptions = {},
) {
  const base = safeFilename(docTitle);
  switch (format) {
    case 'txt': {
      const text = chapters.map(c => `${c.title}\n\n${chapterText(c.content)}`).join('\n\n\n');
      downloadFile(`${base}.txt`, text, 'text/plain');
      return true;
    }
    case 'md': {
      const md = chapters
        .map(c => `# ${c.title}\n\n${looksLikeHtml(c.content) ? htmlToMarkdown(c.content) : normalizeMarkdown(c.content || '')}`)
        .join('\n\n---\n\n');
      downloadFile(`${base}.md`, md, 'text/markdown');
      return true;
    }
    case 'rtf':
      downloadFile(`${base}.rtf`, buildRtf(docTitle, chapters, opts), 'application/rtf');
      return true;
    case 'doc':
      return generateDocx(docTitle, chapters, `${base}.docx`, opts);
    case 'pdf':
      return generatePdf(docTitle, chapters, `${base}.pdf`, opts);
  }
}
