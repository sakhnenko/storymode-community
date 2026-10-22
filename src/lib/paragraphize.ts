/**
 * Promote single-newline-separated lines into proper markdown paragraphs
 * so each "concrete idea" gets its own visual block. Preserves blank-line
 * paragraphs, fenced code, and contiguous list / blockquote / heading runs.
 */
export function paragraphize(input: string): string {
  if (!input) return input;
  const src = input.replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const out: string[] = [];
  let inFence = false;
  const isBlock = (l: string) =>
    /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|\|)/.test(l);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Promote short label-like lines ending with a colon (e.g. "References:")
    // into headings so they render as section labels instead of bordered cards.
    if (
      !inFence &&
      /^\s*[A-Za-z][^:\n]{0,40}:\s*$/.test(line) &&
      !/^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|\|)/.test(line)
    ) {
      line = '#### ' + line.trim();
    }
    out.push(line);
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) continue;
    const next = lines[i + 1];
    if (next === undefined) continue;
    if (line.trim() === '' || next.trim() === '') continue;
    // A line ending in a hard break (a backslash or two spaces, from Shift+Enter
    // in the editor) runs on into the next; a blank line would strand the backslash.
    if (/(\\| {2,})$/.test(line)) continue;
    // Keep contiguous list / heading / blockquote / table runs together.
    if (isBlock(line) && isBlock(next)) continue;
    out.push('');
  }
  return out.join('\n');
}