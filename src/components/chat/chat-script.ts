import { useCallback, useEffect, useRef, type RefObject } from "react";

/** Timing and scrolling helpers for the full-page conversational flows. */

let messageSeq = 0;
export const nextChatId = () => `m${++messageSeq}`;
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Lets a script `await` an assistant message until it has finished typing:
 * `wait(id)` before adding the message, `release(id)` from its onTyped.
 */
export function useTypingGate() {
  const resolvers = useRef(new Map<string, () => void>());
  const wait = useCallback((id: string) => new Promise<void>((resolve) => resolvers.current.set(id, resolve)), []);
  const release = useCallback((id: string) => {
    resolvers.current.get(id)?.();
    resolvers.current.delete(id);
  }, []);
  return { wait, release };
}

/** Keeps the newest message in view while the conversation grows. */
export function useStickToBottom(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
}
