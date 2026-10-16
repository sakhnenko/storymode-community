/**
 * Toggle a checkbox in the markdown content.
 * Finds the nth checkbox and toggles its state.
 */
export function toggleCheckboxInContent(
  content: string,
  checkboxIndex: number
): string {
  // Find all checkboxes in the content
  const checkboxPattern = /\[( |x|X)\]/g;
  let match;
  let currentIndex = 0;
  let result = content;
  
  while ((match = checkboxPattern.exec(content)) !== null) {
    if (currentIndex === checkboxIndex) {
      const isChecked = match[1].toLowerCase() === 'x';
      const replacement = isChecked ? '[ ]' : '[x]';
      result = content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
      break;
    }
    currentIndex++;
  }
  
  return result;
}

/**
 * Parse content and extract checkbox information along with regular text segments.
 * Returns an array of segments that can be rendered with interactive checkboxes.
 */
export interface ContentSegment {
  type: 'text' | 'checkbox';
  content?: string;
  checked?: boolean;
  index?: number;
}

export function parseCheckboxContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const checkboxPattern = /\[( |x|X)\]/g;
  let lastIndex = 0;
  let match;
  let checkboxIndex = 0;
  
  while ((match = checkboxPattern.exec(content)) !== null) {
    // Add text before the checkbox
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }
    
    // Add the checkbox
    segments.push({
      type: 'checkbox',
      checked: match[1].toLowerCase() === 'x',
      index: checkboxIndex++,
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }
  
  return segments;
}
