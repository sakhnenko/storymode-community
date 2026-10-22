// Which passages marked for review the AI editor should answer. Marking the
// same passage twice within a few seconds at the same speed is a double click;
// marking it again later, or at another speed to compare, is a new request.

const DOUBLE_CLICK_MS = 3_000;

export const reviewKey = (item: { intent?: string; quote: string }, speed: string) => `${item.intent ?? ''}:${speed}:${item.quote.trim()}`;

/** Whether a review marked at `markedAt` repeats the last one claimed under `key`. */
export function isDoubleMark(claimed: ReadonlyMap<string, number>, key: string, markedAt: number) {
  const last = claimed.get(key);
  return last != null && Math.abs(markedAt - last) < DOUBLE_CLICK_MS;
}
