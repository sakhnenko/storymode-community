// Pure utility for computing chapter reading stats client-side.
import { markdownText } from '@/lib/markdown';

export const WORDS_PER_PAGE = 250;
const READING_WPM = 238;
const SPEAKING_WPM = 150;

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','of','to','in','on','at','for','with','by','from','as','is','are','was','were','be','been','being','am','do','does','did','have','has','had','it','its','this','that','these','those','i','you','he','she','we','they','them','his','her','their','my','your','our','me','us','him','so','not','no','yes','up','down','out','about','into','over','than','too','very','can','could','would','should','will','just','also','only','more','most','some','any','all','each','every','one','two','three','because','what','which','who','whom','when','where','why','how',
]);

/**
 * The words in plain text, the way word processors count them: runs between
 * spaces that hold a letter or digit, without the punctuation around them.
 * "well-known" is one word, "—" none, "não" one. Every word count in the app
 * comes from here.
 */
export function wordsIn(text: string): string[] {
  return (text || '').split(/\s+/)
    .map(token => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
}

export function countWords(text: string): number {
  return wordsIn(text).length;
}

export function pageCount(words: number): number {
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_PAGE));
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = cleaned.match(/[aeiouy]{1,2}/g);
  return groups ? Math.max(1, groups.length) : 1;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export interface ChapterStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  pages: number;
  readingTime: string;
  speakingTime: string;
  avgWordLength: number;
  avgSentenceLength: number;
  fleschReadingEase: number;
  fleschKincaidGrade: number;
  readingLevelLabel: string;
  topWords: { word: string; count: number }[];
}

export function computeChapterStats(markdown: string): ChapterStats {
  // Read with the same parser as the screens, so marks and list markers aren't counted.
  const plain = markdownText(markdown || '');
  const text = plain.replace(/\s+/g, ' ').trim();
  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s/g, '').length;

  const wordTokens = wordsIn(text);
  const words = wordTokens.length;

  const sentenceTokens = text.split(/[.!?]+(?:\s|$)/).filter(s => s.trim().length > 0);
  const sentences = Math.max(words > 0 ? 1 : 0, sentenceTokens.length);

  const paragraphs = plain ? plain.split(/\n{2,}/).length : 0;

  const pages = pageCount(words);

  const readingMinutes = words / READING_WPM;
  const speakingMinutes = words / SPEAKING_WPM;

  const totalChars = wordTokens.reduce((s: number, w: string) => s + w.length, 0);
  const avgWordLength = words ? totalChars / words : 0;
  const avgSentenceLength = sentences ? words / sentences : 0;

  const totalSyllables = wordTokens.reduce((s: number, w: string) => s + countSyllables(w), 0);

  let fleschReadingEase = 0;
  let fleschKincaidGrade = 0;
  if (words > 0 && sentences > 0) {
    fleschReadingEase = 206.835 - 1.015 * (words / sentences) - 84.6 * (totalSyllables / words);
    fleschKincaidGrade = 0.39 * (words / sentences) + 11.8 * (totalSyllables / words) - 15.59;
  }

  let readingLevelLabel = '—';
  if (words > 0) {
    if (fleschReadingEase >= 90) readingLevelLabel = 'Very easy (5th grade)';
    else if (fleschReadingEase >= 80) readingLevelLabel = 'Easy (6th grade)';
    else if (fleschReadingEase >= 70) readingLevelLabel = 'Fairly easy (7th grade)';
    else if (fleschReadingEase >= 60) readingLevelLabel = 'Plain (8–9th grade)';
    else if (fleschReadingEase >= 50) readingLevelLabel = 'Fairly difficult (10–12th)';
    else if (fleschReadingEase >= 30) readingLevelLabel = 'Difficult (college)';
    else readingLevelLabel = 'Very difficult (college grad)';
  }

  const counts = new Map<string, number>();
  for (const raw of wordTokens) {
    const w = raw.toLowerCase();
    if (w.length < 4 || STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  const topWords = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  return {
    characters,
    charactersNoSpaces,
    words,
    sentences,
    paragraphs,
    pages,
    readingTime: formatDuration(readingMinutes),
    speakingTime: formatDuration(speakingMinutes),
    avgWordLength: Math.round(avgWordLength * 10) / 10,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
    readingLevelLabel,
    topWords,
  };
}