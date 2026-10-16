import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Eye, EyeClosed, PaperPlaneRight } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { parseInlineMarkdown, type InlineSegment } from "@/lib/markdown";

/** Building blocks for the full-page conversational flows (waitlist, welcome). */

export const ENTER = "animate-in fade-in-0 slide-in-from-bottom-3 duration-500 motion-reduce:animate-none";
export const GLASS_EDGE = "border border-white/60 backdrop-blur-xl";
export const GLASS_SHADOW = "shadow-[0_8px_30px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.7)]";
export const GLASS_RAISED = "shadow-[0_20px_50px_rgb(0_0_0/0.25),inset_0_1px_0_rgb(255_255_255/0.8)]";
export const CHIP =
  "rounded-full border border-white/60 bg-white/85 px-4 py-2 text-sm font-medium text-foreground backdrop-blur-xl " +
  "shadow-[0_4px_14px_rgb(0_0_0/0.10),inset_0_1px_0_rgb(255_255_255/0.7)] " +
  "transition hover:bg-white active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60";
export const CHIP_ON = "border-primary bg-primary text-primary-foreground hover:bg-primary";

const TYPE_INTERVAL_MS = 16;
const TYPE_CHARS_PER_TICK = 2;

function Emphasis({ segment, text }: { segment: InlineSegment; text: string }) {
  if (segment.bold && segment.italic) {
    return (
      <strong>
        <em>{text}</em>
      </strong>
    );
  }
  if (segment.bold) return <strong>{text}</strong>;
  if (segment.italic) return <em>{text}</em>;
  return <>{text}</>;
}

/**
 * Holds the composer's place while it is hidden (before the first question, or while
 * chips or a card take the answer), so the conversation doesn't start at the very
 * bottom and jump up when the composer appears. Same height as ChatComposer.
 */
export function ChatComposerSpace() {
  return (
    <div aria-hidden="true" className="pb-12 pt-3">
      <div className="h-[58px]" />
    </div>
  );
}

/** Types out a message, showing *italic* and **bold** as formatting rather than markers. */
function TypewriterText({ text, animate, onDone }: { text: string; animate: boolean; onDone?: () => void }) {
  const segments = useMemo(() => parseInlineMarkdown(text), [text]);
  const plain = useMemo(() => segments.map((s) => s.text).join(""), [segments]);
  const [shown, setShown] = useState(animate ? 0 : plain.length);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (shown >= plain.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current?.();
      }
      return;
    }
    const timer = setTimeout(() => setShown((n) => Math.min(plain.length, n + TYPE_CHARS_PER_TICK)), TYPE_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [shown, plain]);

  let offset = 0;
  return (
    <>
      <span aria-hidden="true">
        {segments.map((segment, i) => {
          const visible = segment.text.slice(0, Math.max(0, shown - offset));
          offset += segment.text.length;
          return visible ? (
            <Fragment key={i}>
              <Emphasis segment={segment} text={visible} />
            </Fragment>
          ) : null;
        })}
      </span>
      <span className="sr-only">{plain}</span>
    </>
  );
}

export function ChatAvatar() {
  return (
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-white/90 object-contain p-1 shadow"
    />
  );
}

export function AssistantMessage({ text, animate, onTyped }: { text: string; animate: boolean; onTyped?: () => void }) {
  return (
    <div className={cn("flex items-start gap-3", ENTER)}>
      <ChatAvatar />
      <p className="text-[15px] leading-relaxed text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.45)]">
        <TypewriterText text={text} animate={animate} onDone={onTyped} />
      </p>
    </div>
  );
}

export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className={cn("flex justify-end", ENTER)}>
      <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-4 py-2 text-[15px] text-primary-foreground shadow-lg">
        {children}
      </div>
    </div>
  );
}

export function QuestionCard({
  title,
  why,
  active,
  aside,
}: {
  title: string;
  why?: string;
  active: boolean;
  aside?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl px-5 py-4 transition-colors duration-300",
        ENTER,
        GLASS_EDGE,
        active ? cn("bg-white/95", GLASS_RAISED) : cn("bg-white/90", GLASS_SHADOW),
      )}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{title}</p>
          {why && <p className="mt-1 text-sm text-muted-foreground">{why}</p>}
        </div>
        {aside}
      </div>
    </div>
  );
}

export function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3" role="status" aria-label={label}>
      <ChatAvatar />
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-bounce rounded-full bg-white/85 motion-reduce:animate-none"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  ariaLabel,
  sendLabel,
  error,
  inputRef,
  type = "text",
  maxLength,
  autoComplete = "off",
  revealLabels,
  username,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  ariaLabel: string;
  sendLabel: string;
  error?: string | null;
  inputRef?: RefObject<HTMLInputElement>;
  type?: "text" | "email" | "password";
  maxLength?: number;
  autoComplete?: string;
  /** For passwords: labels for the show/hide toggle. */
  revealLabels?: { show: string; hide: string };
  /** For passwords: the account's email, so password managers save the right login. */
  username?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="sticky bottom-0 z-10 pb-12 pt-3"
    >
      {username && (
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={username}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />
      )}
      {error && (
        <p role="alert" className="mb-2 inline-block rounded-xl bg-white/95 px-3 py-1.5 text-sm text-destructive shadow">
          {error}
        </p>
      )}
      <div
        className={cn(
          "flex items-center gap-2 rounded-full bg-white/95 py-2 pl-5 pr-2 focus-within:ring-2 focus-within:ring-primary/40",
          GLASS_EDGE,
          "shadow-[0_20px_50px_rgb(0_0_0/0.3),inset_0_1px_0_rgb(255_255_255/0.8)]",
        )}
      >
        <input
          ref={inputRef}
          type={isPassword && revealed ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete={autoComplete}
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {isPassword && revealLabels && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? revealLabels.hide : revealLabels.show}
            aria-pressed={revealed}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:text-foreground"
          >
            {revealed ? <EyeClosed className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
        <button
          type="submit"
          aria-label={sendLabel}
          disabled={!value.trim()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
        >
          <PaperPlaneRight weight="duotone" className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
