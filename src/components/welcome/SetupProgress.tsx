import { useEffect, useState, type ReactNode } from "react";
import i18n, { type LanguageCode } from "@/i18n";
import { Check, SpinnerGap } from "@/components/ui/icons";
import { ENTER, GLASS_EDGE, GLASS_RAISED } from "@/components/chat/ChatKit";
import { cn } from "@/lib/utils";
import type { SetupState } from "@/lib/onboarding";

const HINT_INTERVAL_MS = 2500;

function Row({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className={cn("flex items-start gap-3 text-[15px] leading-6 text-foreground", ENTER)}>
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors",
          done ? "bg-primary text-primary-foreground" : "bg-foreground/5 text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {done ? <Check className="h-3.5 w-3.5" /> : <SpinnerGap className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

/** Live checklist of the first project being built, driven by the setup stream. */
export function SetupProgress({ lng, state }: { lng: LanguageCode; state: SetupState }) {
  const t = (key: string, vars?: Record<string, unknown>) => i18n.t(`welcomeChat.progress.${key}`, { lng, ...vars });
  const planningDone = state.folios.length > 0 || state.finished;
  const hints: unknown = i18n.t(
    `welcomeChat.progress.${state.planning?.fromChapter ? "hintsChapter" : "hintsFresh"}`,
    { lng, returnObjects: true },
  );
  const hintList = Array.isArray(hints) ? hints.filter((h): h is string => typeof h === "string") : [];
  // Pills appear one at a time and stay; the newest pulses until planning ends.
  const [shownHints, setShownHints] = useState(1);

  useEffect(() => {
    if (!state.planning || planningDone || shownHints >= hintList.length) return;
    const timer = setTimeout(() => setShownHints((n) => n + 1), HINT_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [state.planning, planningDone, shownHints, hintList.length]);
  const visibleHints = planningDone ? hintList : hintList.slice(0, shownHints);

  return (
    <div className={cn("rounded-3xl bg-white/95 px-5 py-4", ENTER, GLASS_EDGE, GLASS_RAISED)}>
      <ul className="flex flex-col gap-3" aria-live="polite">
        {state.project && <Row done>{t("project", { title: state.project })}</Row>}
        {state.planning && (
          <Row done={planningDone}>
            {t(state.planning.fromChapter ? "readingChapter" : "sketching")}
            {visibleHints.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {visibleHints.map((hint, i) => {
                  const active = !planningDone && i === visibleHints.length - 1;
                  return (
                    <span key={hint} className={ENTER}>
                      <span
                        className={cn(
                          "inline-block rounded-full px-3 py-1 text-sm transition-colors",
                          active
                            ? "animate-pulse bg-primary/10 text-primary motion-reduce:animate-none"
                            : "bg-foreground/5 text-foreground",
                        )}
                      >
                        {hint}
                      </span>
                    </span>
                  );
                })}
              </span>
            )}
          </Row>
        )}
        {state.folios.map((folio, i) => (
          <Row key={`${folio.title}-${i}`} done>
            <span className="mr-1.5">{folio.icon}</span>
            <span className="font-medium">{folio.title}</span>
            <span className="text-muted-foreground"> · {t("notebooks", { count: folio.notebooks })}</span>
          </Row>
        ))}
        {state.chapter && <Row done>{t("chapter", { title: state.chapter })}</Row>}
        {state.chapter && state.codex && <Row done>{t("codex", { title: state.chapter })}</Row>}
        {state.finished && (
          <Row done>
            <span className="font-semibold">{t("done")}</span>
          </Row>
        )}
      </ul>
    </div>
  );
}
