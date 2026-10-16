import { Notepad } from '@/hooks/useNotepads';

export interface DateEntry {
  notepadId: string;
  notepadTitle: string;
  notepadTheme: string;
  startDate: Date;
  endDate: Date;
  contextSnippet: string;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTH_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function monthIndex(name: string): number {
  const lower = name.toLowerCase();
  let idx = MONTH_NAMES.indexOf(lower);
  if (idx === -1) idx = MONTH_SHORT.indexOf(lower);
  return idx;
}

function getContext(content: string, matchStart: number, matchEnd: number, matchText: string): string {
  // Preserve internal newlines — only trim the outer edges
  const beforeRaw = content.substring(Math.max(0, matchStart - 100), matchStart).replace(/\*\*/g, '');
  const afterRaw = content.substring(matchEnd, Math.min(content.length, matchEnd + 100)).replace(/\*\*/g, '');
  // Trim only the very start of 'before' and very end of 'after', keep inner whitespace/newlines
  const before = beforeRaw.replace(/^\s+/, '');
  const after = afterRaw.replace(/\s+$/, '');
  return `${before}**${matchText}**${after}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Month name pattern (full or abbreviated)
const monthPat = '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

function buildPatterns() {
  // Year pattern: 4+ digits, optionally with comma separators (e.g., 10105 or 10,105)
  const yearPat = '(?:\\d{1,3}(?:,\\d{3})+|\\d{4,})';

  function parseYear(s: string): number {
    return +s.replace(/,/g, '');
  }

  return [
    // ISO date range: "2198-03-04 to 2198-05-22"
    {
      regex: /\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\s*(?:to|[-–—])\s*(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g,
      parse: (m: RegExpExecArray) => {
        const start = new Date(+m[1], +m[2] - 1, +m[3]);
        const end = new Date(+m[4], +m[5] - 1, +m[6]);
        return isNaN(start.getTime()) || isNaN(end.getTime()) ? null : { start, end };
      },
    },
    // ISO: 2025-01-15
    {
      regex: /\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g,
      parse: (m: RegExpExecArray) => {
        const d = new Date(+m[1], +m[2] - 1, +m[3]);
        return isNaN(d.getTime()) ? null : { start: d, end: d };
      },
    },
    // US: 01/15/2025
    {
      regex: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
      parse: (m: RegExpExecArray) => {
        const d = new Date(+m[3], +m[1] - 1, +m[2]);
        return isNaN(d.getTime()) ? null : { start: d, end: d };
      },
    },
    // Full date range: "Mar 7, 10105–Mar 13, 10105" or "January 15, 2025 - February 20, 2025"
    {
      regex: new RegExp(
        `\\b(${monthPat})\\s+(\\d{1,2}),?\\s+(${yearPat})\\s*[-–—]\\s*(${monthPat})\\s+(\\d{1,2}),?\\s+(${yearPat})\\b`,
        'gi'
      ),
      parse: (m: RegExpExecArray) => {
        const mi1 = monthIndex(m[1]);
        const mi2 = monthIndex(m[4]);
        if (mi1 === -1 || mi2 === -1) return null;
        const start = new Date(parseYear(m[3]), mi1, +m[2]);
        const end = new Date(parseYear(m[6]), mi2, +m[5]);
        return isNaN(start.getTime()) || isNaN(end.getTime()) ? null : { start, end };
      },
    },
    // "January 15, 10105" or "Mar 3, 10105" (Month Day, Year with 4+ digit years)
    {
      regex: new RegExp(`\\b(${monthPat})\\s+(\\d{1,2})(?:,?\\s+(${yearPat}))?\\b`, 'gi'),
      parse: (m: RegExpExecArray) => {
        const mi = monthIndex(m[1]);
        if (mi === -1) return null;
        const year = m[3] ? parseYear(m[3]) : new Date().getFullYear();
        const d = new Date(year, mi, +m[2]);
        return isNaN(d.getTime()) ? null : { start: d, end: d };
      },
    },
    // "15 Jan 2025" or "15 January 10105"
    {
      regex: new RegExp(`\\b(\\d{1,2})\\s+(${monthPat})(?:\\s+(${yearPat}))?\\b`, 'gi'),
      parse: (m: RegExpExecArray) => {
        const mi = monthIndex(m[2]);
        if (mi === -1) return null;
        const year = m[3] ? parseYear(m[3]) : new Date().getFullYear();
        const d = new Date(year, mi, +m[1]);
        return isNaN(d.getTime()) ? null : { start: d, end: d };
      },
    },
    // Date range: "Jan 15 - Feb 20, 2025"
    {
      regex: new RegExp(
        `\\b(${monthPat})\\s+(\\d{1,2})\\s*[-–—]\\s*(${monthPat})\\s+(\\d{1,2})(?:,?\\s+(${yearPat}))?\\b`,
        'gi'
      ),
      parse: (m: RegExpExecArray) => {
        const mi1 = monthIndex(m[1]);
        const mi2 = monthIndex(m[3]);
        if (mi1 === -1 || mi2 === -1) return null;
        const year = m[5] ? parseYear(m[5]) : new Date().getFullYear();
        const start = new Date(year, mi1, +m[2]);
        const end = new Date(year, mi2, +m[4]);
        return isNaN(start.getTime()) || isNaN(end.getTime()) ? null : { start, end };
      },
    },
    // "from March to June 2025"
    {
      regex: new RegExp(
        `\\bfrom\\s+(${monthPat})\\s+to\\s+(${monthPat})(?:\\s+(${yearPat}))?\\b`,
        'gi'
      ),
      parse: (m: RegExpExecArray) => {
        const mi1 = monthIndex(m[1]);
        const mi2 = monthIndex(m[2]);
        if (mi1 === -1 || mi2 === -1) return null;
        const year = m[3] ? parseYear(m[3]) : new Date().getFullYear();
        const start = new Date(year, mi1, 1);
        const end = new Date(year, mi2, lastDayOfMonth(year, mi2));
        return { start, end };
      },
    },
    // Standalone "March 10105" (month + year)
    {
      regex: new RegExp(`\\b(${monthPat})\\s+(${yearPat})\\b`, 'gi'),
      parse: (m: RegExpExecArray) => {
        const mi = monthIndex(m[1]);
        if (mi === -1) return null;
        const year = parseYear(m[2]);
        if (year < 1000) return null;
        const start = new Date(year, mi, 1);
        const end = new Date(year, mi, lastDayOfMonth(year, mi));
        return { start, end };
      },
    },
    // Year range: "2189–2193" or "8050-10,010"
    {
      regex: new RegExp(`\\b(${yearPat})\\s*[-–—]\\s*(${yearPat})\\b`, 'g'),
      parse: (m: RegExpExecArray) => {
        const y1 = parseYear(m[1]);
        const y2 = parseYear(m[2]);
        if (y1 < 1000 || y2 < 1000) return null;
        if (y2 <= y1) return null;
        return { start: new Date(y1, 0, 1), end: new Date(y2, 11, 31) };
      },
      validate: (m: RegExpExecArray, content: string) => {
        const before = content.substring(Math.max(0, m.index - 1), m.index);
        const after = content.substring(m.index + m[0].length, m.index + m[0].length + 1);
        if (/[a-fA-F0-9\-/]/.test(before) || /[a-fA-F0-9\-/]/.test(after)) return false;
        return true;
      },
    },
    // Standalone year: "2051" or "10,010"
    {
      regex: /\b(\d{1,3}(?:,\d{3})+|\d{4,})\b/g,
      parse: (m: RegExpExecArray) => {
        const y = +m[1].replace(/,/g, '');
        if (y < 1000) return null;
        return { start: new Date(y, 0, 1), end: new Date(y, 11, 31) };
      },
      validate: (m: RegExpExecArray, content: string) => {
        const before = content.substring(Math.max(0, m.index - 1), m.index);
        const after = content.substring(m.index + m[0].length, m.index + m[0].length + 1);
        if (/[a-fA-F0-9\-/–—]/.test(before) || /[a-fA-F0-9\-/–—]/.test(after)) return false;
        return true;
      },
    },
  ];
}

export function extractDates(notepads: Notepad[]): DateEntry[] {
  const patterns = buildPatterns();
  const entries: DateEntry[] = [];

  for (const notepad of notepads) {
    if (!notepad.content?.trim()) continue;
    const content = notepad.content;
    // Track which character ranges we've already matched to avoid duplicates
    const matched: { start: number; end: number }[] = [];

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.regex.exec(content)) !== null) {
        const mStart = m.index;
        const mEnd = m.index + m[0].length;
        // Avoid duplicate matches at overlapping positions
        const isDuplicate = matched.some(k => mStart < k.end && mEnd > k.start);
        if (isDuplicate) continue;

        // Run optional validate check (e.g., UUID context rejection)
        if (pattern.validate && !pattern.validate(m, content)) continue;

        matched.push({ start: mStart, end: mEnd });

        const result = pattern.parse(m);
        if (!result) continue;

        entries.push({
          notepadId: notepad.id,
          notepadTitle: notepad.title,
          notepadTheme: notepad.theme,
          startDate: result.start,
          endDate: result.end,
          contextSnippet: getContext(content, mStart, mEnd, m[0]),
        });
      }
    }
  }

  return entries;
}
