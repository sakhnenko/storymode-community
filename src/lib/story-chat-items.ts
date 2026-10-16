/**
 * Splitting an AI editor answer's sections into items: quotes, suggestions
 * ("Try: …", style variants such as "Lyrical: …") and plain text. Kept apart
 * from the chat component so it can be tested on its own.
 */

// Break a group body into discrete items. Items are separated by blank lines,
// markdown bullets, numbered list markers, or suggestion boundaries (Try:/Could be:).
// Empty/whitespace bodies return [].
export type BodyItemType = 'quote' | 'suggestion' | 'text';
export type BodyItem = { text: string; type: BodyItemType };

const SUGGESTION_RE = /^\s*(try|could be|option|alt|alternative|tente|poderia ser|op[çc][ãa]o|alternativa)\s*[:;]/i;

// "Crisp and direct: ...", "Lyrical tilt: ...", "Uma passada polida: ..." — a
// short style label followed by a full alternative version of the passage.
// Labels are matched with Unicode letter classes so accented (pt-BR) labels
// group exactly like English ones.
const VARIANT_RE = /^\s*(?:\*\*)?(?:#{1,6}\s*)?(\p{L}[\p{L}'’\-. ]{2,80}?)(?:\*\*)?\s*:\s+(\S[\s\S]*)$/u;

const LABEL_CHARS_RE = /^\p{L}[\p{L}'’\-\s.]*$/u;

const STYLE_VARIANT_RE = /\b(?:lyric(?:al)?|poetic|crisp|direct|tight|sharp|lean|clipped|spare|clean|trim|minimal|blunt|observational|measured|neutral|plain|reportorial|detached|clinical|matter-of-fact|cinematic|visual|vivid|immersive|scenic|tense|urgent|dramatic|punchy|action|kinetic|fast|charged|warm|intimate|emotional|tender|close|soft|sweeping|compressed|condensed|short|brief|terse|formal|literary|classic|elegant|ornate|elevated|playful|light|humorous|wry|witty|quirky|dark|grim|cold|bleak|stark|past-tense|present-tense|author-inspired|inspired)\b/i;

// pt-BR equivalents of the style-label vocabulary above.
const STYLE_VARIANT_PTBR_RE = /(?:l[íi]ric[oa]|po[ée]tic[oa]|enxut[oa]|diret[oa]|sec[oa]|s[óo]bri[oa]|conteni?d[oa]|concis[oa]|breve|curt[oa]|clar[oa]|simples|neutr[oa]|cinematogr[áa]fic[oa]|visual|vívid[oa]|imersiv[oa]|tens[oa]|urgente|dram[áa]tic[oa]|[íi]ntim[oa]|emotiv[oa]|quente|suave|fri[oa]|sombri[oa]|cr[uú]|formal|liter[áa]ri[oa]|cl[áa]ssic[oa]|elegante|ornament(?:al|ad[oa])|elevad[oa]|leve|bem-humorad[oa]|ir[ôo]nic[oa]|polid[oa]|passada|vers[ãa]o|reescrita|alternativa|no estilo de)/i;

// A style label is a NAME ("Crisp and direct", "Lyrical tilt"), never a
// sentence. Editorial headings like "This is a clean power image" happen to
// contain style vocabulary ("clean"), and treating them as variant labels made
// the whole rest of the answer collapse into one dashed replacement card.
const SENTENCE_LABEL_START_RE = /^(this|that|these|those|it|there|here|isso|isto|esse|essa|aqui)\b/i;
const SENTENCE_LABEL_VERB_RE = /\b(is|are|was|were|be|been|being|has|have|had|do|does|did|works|reads|lands|feels|keeps|makes|é|são|está|estão|fica|funciona)\b/i;

export function isStyleVariantLabel(label: string): boolean {
  const normalized = label.trim();
  // Named or invented style headings are open-ended ("Sparse Realism",
  // "Atmospheric Literary Fiction", etc.). Treat the model's explicit
  // "In (the) style of …" shape as authoritative instead of requiring the
  // style name itself to contain one of our known keywords.
  if (/^in\s+(?:the\s+)?style\s+of\s+\S.+$/i.test(normalized)) return true;
  if (/^no\s+estilo\s+d[eoa]\s+\S.+$/i.test(normalized)) return true;
  // Reject anything that reads as a sentence rather than a label.
  if (SENTENCE_LABEL_START_RE.test(normalized)) return false;
  if (SENTENCE_LABEL_VERB_RE.test(normalized)) return false;
  if (normalized.split(/\s+/).length > 6) return false;
  return STYLE_VARIANT_RE.test(normalized) || STYLE_VARIANT_PTBR_RE.test(normalized);
}


export function getVariantLabel(line: string): { label: string; rest: string } | null {
  if (SUGGESTION_RE.test(line)) return null;
  const m = line.match(VARIANT_RE);
  if (!m) return null;
  const label = m[1].trim();
  // The model sometimes blockquotes the rewrite ("> ..."); never leak the
  // markdown ">" into the rendered or copied text.
  const rest = m[2].replace(/^\s*>\s?/gm, '').trim();
  if (label.split(/\s+/).length > 12) return null;
  if (!isStyleVariantLabel(label)) return null;
  if (rest.length < 40) return null;
  return { label, rest };
}

function isSuggestionLine(line: string): boolean {
  return SUGGESTION_RE.test(line);
}


// The model sometimes "annotates" a quoted word by parenthesising the part it
// wants to discuss ("rubb(ed)", "walk(ing)"). Quotes must be verbatim, so glue
// those fragments back together whenever the paren hugs the preceding word and
// contains only a short lowercase letter run.
function unmangleWordAnnotations(text: string): string {
  return text
    .replace(/([A-Za-z]{2,})\(([A-Za-z]{1,4})\)(?=[^A-Za-z]|$)/g, '$1$2')
    .replace(/\(([A-Za-z]{1,4})\)([A-Za-z]{2,})/g, '$1$2');
}

// The model often writes a style label on its own line ("Lean and clipped")
// followed by the alternative passage below it. Fold those into a single
// "Label: passage" line so they render as labelled suggestion boxes.
function foldStandaloneLabels(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const bare = raw
      .trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\*\*(.+?)\*\*$/, '$1')
      .replace(/:\s*$/, '')
      .trim();
    const isLabel =
      bare.length > 2 &&
      bare.length <= 80 &&
      bare.split(/\s+/).length <= 12 &&
      LABEL_CHARS_RE.test(bare) &&
      !/^\s*>/.test(raw) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(raw.trim()) &&
      !SUGGESTION_RE.test(bare + ':') &&
      isStyleVariantLabel(bare);
    if (isLabel) {
      // find next non-empty line
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = lines[j];
      if (next && next.trim().length >= 40 && !/^\s*>/.test(next) && !getVariantLabel(next.trim())) {
        out.push(`${bare}: ${next.trim()}`);
        i = j;
        continue;
      }
    }
    out.push(raw);
  }
  return out;
}

// Alternative requests often come back as plain markdown paragraphs:
// "Lean and clipped" followed by a long replacement paragraph. Detect that
// shape before the general feedback-group parser can treat it as ordinary prose.
export function splitStandaloneAlternatives(content: string): { lead: string; items: BodyItem[] } | null {
  // Models are inconsistent about blank lines around labels. Force standalone
  // markdown headings, bold labels and short colon labels onto block boundaries
  // so a later variant cannot be swallowed by the preceding rewrite.
  const separatedContent = content
    .replace(/^(\s*#{1,6}\s+\p{L}[^\n]{1,80}:?\s*)$/gmu, '\n\n$1\n\n')
    .replace(/^(\s*\*\*\p{L}[^*\n]{1,80}:?\*\*\s*)$/gmu, '\n\n$1\n\n')
    .replace(/^(\s*\p{L}[\p{L}'’\-\s.]{2,80}:\s*)$/gmu, '\n\n$1\n\n');
  const blocks = separatedContent
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  const alternatives: BodyItem[] = [];
  const lead: string[] = [];
  let firstAlternativeIndex = -1;

  const cleanLabel = (block: string) => block
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\*\*(.+?)\*\*$/, '$1')
    .replace(/:\s*$/, '')
    .trim();
  const isLabel = (block: string) => {
    const label = cleanLabel(block);
    return label.length >= 3 &&
      label.length <= 80 &&
      label.split(/\s+/).length <= 12 &&
      LABEL_CHARS_RE.test(label) &&
      !/^(try|could be|option|alt|alternative|tente|poderia ser|op[çc][ãa]o|alternativa)$/i.test(label) &&
      isStyleVariantLabel(label);
  };

  const inlineVariant = (block: string): { label: string; rest: string } | null => {
    const flattened = block.replace(/\n+/g, ' ').trim();
    const match = flattened.match(VARIANT_RE);
    if (!match) return null;
    const label = match[1].trim();
    const rest = match[2].replace(/^\s*>\s?/gm, '').trim();
    if (label.split(/\s+/).length > 12 || rest.length < 40 || !isStyleVariantLabel(label)) return null;
    return { label, rest };
  };
  const startsVariant = (block: string) => isLabel(block) || Boolean(inlineVariant(block));

  for (let i = 0; i < blocks.length;) {
    const inline = inlineVariant(blocks[i]);
    if (!isLabel(blocks[i]) && !inline) {
      if (firstAlternativeIndex < 0) lead.push(blocks[i]);
      i += 1;
      continue;
    }

    if (firstAlternativeIndex < 0) firstAlternativeIndex = i;
    const label = inline?.label ?? cleanLabel(blocks[i]);
    const bodyBlocks: string[] = inline ? [inline.rest] : [];
    let j = i + 1;

    // A rewrite can contain several paragraphs. Keep consuming until the next
    // author/style label so dialogue and narration never spill outside its box.
    while (j < blocks.length && !startsVariant(blocks[j])) {
      bodyBlocks.push(blocks[j]);
      j += 1;
    }

    const body = bodyBlocks
      .join('\n\n')
      .replace(/^\s*>\s?/gm, '')
      .trim();
    if (body.length >= 40) {
      alternatives.push({ type: 'suggestion', text: `${label}: ${body}` });
    }
    i = j;
  }

  return alternatives.length >= 2
    ? { lead: lead.join('\n\n'), items: alternatives }
    : null;
}

export function splitBodyIntoItems(body: string): BodyItem[] {
  const trimmed = unmangleWordAnnotations(body.trim());
  if (!trimmed) return [];

  const lines = foldStandaloneLabels(trimmed.split('\n'));

  const items: BodyItem[] = [];
  let buf: string[] = [];
  let bufQuoteLines = 0;
  let bufTotalLines = 0;

  const flush = () => {
    const t = buf.join('\n').trim();
    if (t) {
      let type: BodyItemType = 'text';
      if (bufTotalLines > 0 && bufQuoteLines === bufTotalLines) {
        type = 'quote';
      }
      items.push({ text: t, type });
    }
    buf = [];
    bufQuoteLines = 0;
    bufTotalLines = 0;
  };

  for (const raw of lines) {
    const stripped = raw.replace(/\s+$/, '');
    const wasQuote = /^\s*>\s?/.test(stripped);
    const line = stripped.replace(/^\s*>\s?/, '');
    const isSuggestion = isSuggestionLine(line);
    const isVariant = !wasQuote && Boolean(getVariantLabel(line));

    // Replacement lines are complete, self-contained items. Never let the
    // commentary after a `Try:`/`Could be:` line leak into its dashed action
    // card, even when the model forgets the expected blank line.
    if (isSuggestion || isVariant) {
      flush();
      items.push({ text: line.trim(), type: 'suggestion' });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    // A quoted passage and the comment on it are separate items even when the
    // model leaves out the blank line between them.
    const bufIsQuote = bufTotalLines > 0 && bufQuoteLines === bufTotalLines;
    if (bufTotalLines > 0 && wasQuote !== bufIsQuote) flush();

    buf.push(wasQuote ? line : stripped);
    bufTotalLines += 1;
    if (wasQuote) bufQuoteLines += 1;
  }

  flush();
  // A list the model spaced out with blank lines is still one list.
  const LIST_ITEM = /^\s*([-*+]|\d+[.)])\s+/;
  const merged: BodyItem[] = [];
  for (const it of items) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === 'text' && it.type === 'text' && LIST_ITEM.test(it.text) && LIST_ITEM.test(prev.text.split('\n').pop() ?? '')) {
      prev.text = `${prev.text}\n${it.text}`;
    } else merged.push({ ...it });
  }
  return merged.map((it) =>
    it.type === 'text' && getVariantLabel(it.text.split('\n')[0]) ? { ...it, type: 'suggestion' as const } : it
  );
}
