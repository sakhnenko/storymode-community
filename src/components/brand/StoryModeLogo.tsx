import { cn } from "@/lib/utils";

interface StoryModeLogoProps {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  compact?: boolean;
  /** The wordmark's first word, before the italic "mode" (the 404 page says "Sorry"). */
  word?: string;
}

export function StoryModeLogo({
  className,
  markClassName,
  wordmarkClassName,
  compact = false,
  word = "Story",
}: StoryModeLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <img
        src="/logo.png"
        alt=""
        aria-hidden="true"
        className={cn("block h-7 w-7 shrink-0 object-contain", markClassName)}
      />
      {!compact && (
        <span
          className={cn("text-2xl font-medium leading-none text-foreground", wordmarkClassName)}
          style={{ fontFamily: "'Newsreader', serif" }}
        >
          {word}<em className="font-normal">mode</em>
        </span>
      )}
      <span className="sr-only">StoryMode</span>
    </span>
  );
}

export default StoryModeLogo;