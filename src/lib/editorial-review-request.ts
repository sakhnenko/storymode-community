// This is the short request shown in chat. Detailed review criteria live in
// the story-chat Edge Function and must not be copied into this message.
export const EDITORIAL_REVIEW_REQUEST = {
  en: 'Review this passage.',
  'pt-BR': 'Revise esta passagem.',
} as const;

export type EditorialKind = 'literary' | 'academic' | 'technical' | 'general';

// Older automatic requests have no recorded classification. Clean their
// display without guessing a type or changing the stored conversation.
export function visibleEditorialRequest(request: string): string {
  if (request === 'Review this passage as a literary, academic, or technical editor, whichever fits the writing.') {
    return EDITORIAL_REVIEW_REQUEST.en;
  }
  if (request === 'Revise esta passagem como editor literário, acadêmico ou técnico, conforme o texto.') {
    return EDITORIAL_REVIEW_REQUEST['pt-BR'];
  }
  return request;
}

export function editorialReviewRequest(language: string, kind?: EditorialKind): string {
  if (!kind || kind === 'general') {
    return EDITORIAL_REVIEW_REQUEST[language === 'pt-BR' ? 'pt-BR' : 'en'];
  }
  const editor = language === 'pt-BR'
    ? { literary: 'literário', academic: 'acadêmico', technical: 'técnico' }[kind]
    : kind;
  return language === 'pt-BR'
    ? `Revise esta passagem como editor ${editor}.`
    : `Review this passage as ${kind === 'academic' ? 'an' : 'a'} ${editor} editor.`;
}

// Read only a completed metadata line at the start of the model response.
// Waiting for the newline prevents partial streamed words from becoming labels.
export function readEditorialMetadata(raw: string, finished = false): {
  kind?: EditorialKind;
  content: string;
} {
  const match = raw.match(/^\s*\[editor\][ \t]*([^\r\n]*)(?:\r?\n|$)/i);
  if (!match || (!finished && !match[0].endsWith('\n'))) return { content: raw };
  const value = match[1].trim().toLowerCase();
  const kind = value === 'literary' || value === 'academic' || value === 'technical' || value === 'general'
    ? value
    : undefined;
  return { kind, content: raw.slice(match[0].length) };
}
