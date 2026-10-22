import { useCallback, useEffect, useRef, useState } from 'react';
import type { MemoryKind } from '../../../supabase/functions/_shared/project-memory';

export interface Flight {
  name: string;
  kind: MemoryKind;
  /** data-node of the card it lands on: an existing entry, or `ghost:…` for a new one. */
  target: string;
  /** The fact it carries, shown on its card when it lands. */
  fact?: string;
  /** The chapter being read when it was found. */
  chapterId: string;
}

/**
 * One pill in the air at a time: the next leaves just after the previous
 * lands, so each card visibly fills before anything else moves. Slow enough
 * to read the name on the way.
 */
const DURATION = 1500;
const PAUSE = 150;
const PILL = 'pointer-events-none fixed left-0 top-0 z-[60] whitespace-nowrap rounded-full bg-primary px-2.5 py-1 font-sans text-xs font-medium text-primary-foreground shadow-lg';

/** Where finds leave from: the chapter being read in the sidebar if it is open, else the toolbar's status. */
function sourceRect() {
  const rects = [...document.querySelectorAll('[data-reading-source]')].map(el => el.getBoundingClientRect())
    .filter(r => r.width > 0 && r.height > 0);
  return rects.sort((a, b) => b.width - a.width)[0];
}

/** Where a flight should land: its card if visible, else its row's title, kept inside the canvas. */
function landingPoint(flight: Flight, canvas: DOMRect | undefined) {
  let point: { x: number; y: number } | undefined;
  // A placeholder replaced by its saved card while the pill was queued: land on the card.
  const saved = flight.target.startsWith('ghost:') ? flight.target.slice(6).replace('|', ':') : null;
  const card = document.querySelector(`[data-node="${CSS.escape(flight.target)}"]`)
    || (saved ? document.querySelector(`[data-node="${CSS.escape(saved)}"]`) : null);
  if (card) {
    const r = card.getBoundingClientRect();
    const row = card.parentElement?.getBoundingClientRect();
    const inRow = !row || (r.right > row.left + 8 && r.left < row.right - 8);
    const inCanvas = !canvas || (r.bottom > canvas.top && r.top < canvas.bottom);
    if (inRow && inCanvas) point = { x: r.left + Math.min(56, r.width / 2), y: r.top + 18 };
  }
  if (!point) {
    const header = document.getElementById(`codex-row-${flight.kind}`)?.getBoundingClientRect();
    if (header) point = { x: header.left + 56, y: header.top + header.height / 2 };
  }
  if (!point && canvas) point = { x: canvas.left + canvas.width / 2, y: canvas.top + 24 };
  if (point && canvas) point.y = Math.min(Math.max(point.y, canvas.top + 12), canvas.bottom - 12);
  return point;
}

/**
 * Items found while a chapter is read pop out of it one at a time
 * and fly in an arc to their card or row. `onLand` fires when each arrives,
 * straight away when motion is reduced or nothing is on screen to fly from.
 */
export function useCodexFlights(canvasRef: React.RefObject<HTMLElement>, onLand: (flight: Flight) => void) {
  const [splash, setSplash] = useState(0);
  const queue = useRef<Flight[]>([]);
  const timer = useRef<number | null>(null);
  const flying = useRef(false);
  // Pills still queued when a chapter finishes leave from where it was.
  const lastSource = useRef<DOMRect | undefined>();
  const pills = useRef(new Set<HTMLElement>());
  const onLandRef = useRef(onLand);
  onLandRef.current = onLand;

  const fly = useCallback((flight: Flight, landed: () => void) => {
    const from = sourceRect() || lastSource.current;
    lastSource.current = from;
    const to = landingPoint(flight, canvasRef.current?.getBoundingClientRect());
    if (!from || !to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onLandRef.current(flight);
      landed();
      return;
    }
    setSplash(s => s + 1);
    const pill = document.createElement('div');
    pill.className = PILL;
    pill.textContent = flight.name;
    document.body.appendChild(pill);
    pills.current.add(pill);
    const w = pill.offsetWidth, h = pill.offsetHeight;
    const start = { x: from.left + Math.min(from.width / 2, 90) - w / 2, y: from.top + from.height / 2 - h / 2 };
    const end = { x: to.x - Math.min(w / 2, 40), y: to.y - h / 2 };
    // Pops up out of the chapter and pauses there long enough to read, then arcs to its card.
    const lifted = { x: start.x, y: start.y - 22 };
    const frames: Keyframe[] = [
      { transform: `translate(${start.x}px, ${start.y}px) scale(0.4)`, opacity: 0, offset: 0 },
      { transform: `translate(${lifted.x}px, ${lifted.y}px) scale(1.12)`, opacity: 1, offset: 0.1 },
      { transform: `translate(${lifted.x}px, ${lifted.y}px) scale(1)`, opacity: 1, offset: 0.35 },
    ];
    const control = { x: (lifted.x + end.x) / 2, y: Math.min(lifted.y, end.y) - 110 };
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      const x = (1 - t) ** 2 * lifted.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x;
      const y = (1 - t) ** 2 * lifted.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y;
      const scale = t > 0.85 ? 1 - ((t - 0.85) / 0.15) * 0.35 : 1;
      frames.push({ transform: `translate(${x}px, ${y}px) scale(${scale})`, opacity: t > 0.9 ? 1 - (t - 0.9) / 0.1 : 1,
        offset: 0.35 + 0.65 * t, easing: 'ease-in-out' });
    }
    const animation = pill.animate(frames, { duration: DURATION, fill: 'forwards' });
    animation.onfinish = () => {
      pill.remove();
      pills.current.delete(pill);
      onLandRef.current(flight);
      landed();
    };
  }, [canvasRef]);

  const launchNext = useCallback(() => {
    timer.current = null;
    const flight = queue.current.shift();
    if (!flight) { flying.current = false; return; }
    flying.current = true;
    fly(flight, () => { timer.current = window.setTimeout(launchNext, PAUSE); });
  }, [fly]);

  const launch = useCallback((flight: Flight) => {
    queue.current.push(flight);
    if (!flying.current) launchNext();
  }, [launchNext]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    for (const pill of pills.current) pill.remove();
  }, []);

  return { launch, splash };
}
