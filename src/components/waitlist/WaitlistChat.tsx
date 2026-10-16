import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import i18n, { setLanguage, type LanguageCode } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  AssistantMessage,
  CHIP,
  ChatComposer,
  ChatComposerSpace,
  ENTER,
  QuestionCard,
  TypingIndicator,
  UserBubble,
} from "@/components/chat/ChatKit";
import { nextChatId, prefersReducedMotion, sleep, useStickToBottom, useTypingGate } from "@/components/chat/chat-script";
import {
  DETAIL_CHIPS,
  EMAIL_RE,
  LIMITS,
  OWN_KEY_ANSWERS,
  PROJECT_KEYS,
  TOTAL_STEPS,
  WRITING_LANGUAGES,
  aiReplyPayload,
  emptyAnswers,
  joinParts,
  nextStep,
  stepInputs,
  stepNumber,
  submissionPayload,
  uiLanguageForTyped,
  wantsAiReply,
  type OwnKeyAnswer,
  type ProjectKey,
  type StepId,
  type WaitlistAnswers,
} from "@/lib/waitlist-flow";

type ChatMessage =
  | { kind: "assistant"; id: string; text: string; animate: boolean }
  | { kind: "user"; id: string; text: string }
  | { kind: "question"; id: string; step: StepId; lng: LanguageCode; title: string; why: string; active: boolean };

interface Chip {
  id: string;
  label: string;
  /** What gets stored: the English label, or the id for yes/no style answers. */
  value: string;
}

const MIN_TYPING_MS = 700;
const QUESTION_DELAY_MS = 350;
const AI_REPLY_TIMEOUT_MS = 8000;

const MAX_LENGTH: Record<StepId, number> = {
  language: LIMITS.language,
  name: LIMITS.name,
  project: LIMITS.project,
  project_detail: LIMITS.detail,
  premise: LIMITS.premise,
  own_key: 0,
  email: LIMITS.email,
};

const tr = (lng: LanguageCode, key: string, vars?: Record<string, string>) =>
  i18n.t(`waitlistChat.${key}`, { lng, ...vars });

/** One line, at random, from a list of reply variants. */
function pickVariant(lng: LanguageCode, key: string, vars?: Record<string, string>) {
  const options: unknown = i18n.t(`waitlistChat.${key}`, { lng, returnObjects: true, ...vars });
  const lines = Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : [];
  return lines.length ? lines[Math.floor(Math.random() * lines.length)] : tr(lng, key, vars);
}

function questionText(step: StepId, a: WaitlistAnswers) {
  const key = step === "project_detail" ? `questions.detail.${a.projectKey ?? "custom"}` : `questions.${step}`;
  return { title: tr(a.uiLanguage, `${key}.title`), why: tr(a.uiLanguage, `${key}.why`) };
}

function placeholderFor(step: StepId, a: WaitlistAnswers) {
  if (step === "own_key") return "";
  if (step === "project_detail") return tr(a.uiLanguage, "questions.detail.placeholder");
  return tr(a.uiLanguage, `questions.${step}.placeholder`);
}

function chipsFor(step: StepId, a: WaitlistAnswers): { chips: Chip[] } | null {
  const lng = a.uiLanguage;
  const localized = (group: string, id: string): Chip => ({
    id,
    label: tr(lng, `options.${group}.${id}`),
    value: tr("en", `options.${group}.${id}`),
  });
  switch (step) {
    case "language":
      return { chips: WRITING_LANGUAGES.map((l) => ({ id: l.id, label: l.nativeLabel, value: l.value })) };
    case "project":
      return { chips: PROJECT_KEYS.map((k) => localized("projects", k)) };
    case "project_detail": {
      if (!a.projectKey) return null;
      const g = DETAIL_CHIPS[a.projectKey];
      return { chips: g.ids.map((id) => localized(g.group, id)) };
    }
    case "own_key":
      return { chips: OWN_KEY_ANSWERS.map((k) => ({ id: k, label: tr(lng, `options.ownKey.${k}`), value: k })) };
    default:
      return null;
  }
}

async function fetchAiReply(step: StepId, a: WaitlistAnswers): Promise<string | null> {
  try {
    const result = await Promise.race([
      supabase.functions.invoke("waitlist-chat", { body: aiReplyPayload(step, a) }),
      sleep(AI_REPLY_TIMEOUT_MS).then(() => null),
    ]);
    const reply = result && !result.error ? result.data?.reply : null;
    return typeof reply === "string" && reply.trim() ? reply.trim() : null;
  } catch {
    return null;
  }
}

async function submitSignup(a: WaitlistAnswers): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("notify-waitlist", { body: submissionPayload(a) });
    return !error;
  } catch {
    return false;
  }
}

function StepProgress({ step, label }: { step: StepId; label: string }) {
  const current = stepNumber(step);
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex w-24 gap-1" aria-hidden="true">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors", i < current ? "bg-primary" : "bg-foreground/10")}
          />
        ))}
      </div>
    </div>
  );
}

export function WaitlistChat() {
  const navigate = useNavigate();
  const reduceMotion = useMemo(prefersReducedMotion, []);

  const [answers, setAnswers] = useState<WaitlistAnswers>(() =>
    emptyAnswers(i18n.resolvedLanguage === "pt-BR" ? "pt-BR" : "en"),
  );
  const answersRef = useRef(answers);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(true);
  const busyRef = useRef(true);
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);
  const { wait: waitTyped, release: handleTyped } = useTypingGate();
  useStickToBottom(listRef);

  const setBusyState = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);

  const say = useCallback(
    (text: string) => {
      const id = nextChatId();
      const typed = waitTyped(id);
      setMessages((m) => [...m, { kind: "assistant", id, text, animate: !reduceMotion }]);
      return typed;
    },
    [reduceMotion, waitTyped],
  );

  const ask = useCallback((step: StepId, a: WaitlistAnswers) => {
    const { title, why } = questionText(step, a);
    setMessages((m) => [...m, { kind: "question", id: nextChatId(), step, lng: a.uiLanguage, title, why, active: true }]);
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      await say(tr(answersRef.current.uiLanguage, "greeting"));
      await sleep(QUESTION_DELAY_MS);
      ask("language", answersRef.current);
      setBusyState(false);
    })();
  }, [say, ask, setBusyState]);

  let activeQuestion: Extract<ChatMessage, { kind: "question" }> | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === "question" && m.active) {
      activeQuestion = m;
      break;
    }
  }
  const activeStep = !busy && !done ? activeQuestion?.step ?? null : null;
  const inputs = activeStep ? stepInputs(activeStep, answers.projectKey) : null;
  const chipSet = activeStep && inputs?.chips ? chipsFor(activeStep, answers) : null;

  useEffect(() => {
    if (activeStep && inputs?.text && !inputs.chips) inputRef.current?.focus();
    // Focus only when a new question becomes active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestion?.id, busy]);

  const answer = async (step: StepId, picked: Chip[], typed: string, skipped = false) => {
    if (busyRef.current) return;
    const lng = answersRef.current.uiLanguage;
    const text = typed.trim();
    if (step === "name" && !text) {
      setError(tr(lng, "errors.nameRequired"));
      return;
    }
    if (step === "email" && !EMAIL_RE.test(text)) {
      setError(tr(lng, "errors.emailInvalid"));
      return;
    }
    if (!skipped && picked.length === 0 && !text) return;

    setBusyState(true);
    setError(null);

    const next: WaitlistAnswers = { ...answersRef.current };
    const display = skipped ? tr(lng, "skip") : joinParts([...picked.map((c) => c.label), text]);
    let prewritten = "";

    switch (step) {
      case "language": {
        const option = WRITING_LANGUAGES.find((l) => l.id === picked[0]?.id);
        const ui = option ? option.ui : uiLanguageForTyped(text);
        next.writingLanguage = option?.value ?? text;
        next.uiLanguage = ui ?? "en";
        prewritten = ui
          ? tr(next.uiLanguage, "replies.languageChosen")
          : tr("en", "replies.languageUnsupported", { language: display });
        break;
      }
      case "name":
        next.name = text;
        prewritten = tr(lng, "replies.name", { name: text });
        break;
      case "project": {
        const key = picked[0]?.id as ProjectKey | undefined;
        next.projectKey = key ?? null;
        next.projectType = key ? picked[0].value : text;
        next.projectDetail = "";
        prewritten = key
          ? tr(lng, `replies.project.${key}`)
          : pickVariant(lng, "replies.customProject", { project: text });
        break;
      }
      case "project_detail":
        next.projectDetail = skipped ? "" : joinParts([...picked.map((c) => c.value), text]);
        prewritten = skipped
          ? tr(lng, "replies.detailSkipped")
          : text
            ? pickVariant(lng, "replies.customDetail", { detail: display })
            : tr(lng, "replies.detail", { detail: display });
        break;
      case "premise":
        next.premise = skipped ? "" : text;
        prewritten = skipped ? tr(lng, "replies.premiseSkipped") : pickVariant(lng, "replies.premise");
        break;
      case "own_key": {
        const choice = picked[0]?.id as OwnKeyAnswer;
        next.ownKey = choice;
        prewritten = tr(lng, `replies.ownKey.${choice}`);
        break;
      }
      case "email":
        next.email = text.toLowerCase();
        prewritten = tr(lng, "replies.done", { name: next.name, email: next.email });
        break;
    }

    answersRef.current = next;
    setAnswers(next);
    if (step === "language") setLanguage(next.uiLanguage);

    setMessages((m) => [
      ...m.map((msg) => (msg.kind === "question" && msg.active ? { ...msg, active: false } : msg)),
      { kind: "user", id: nextChatId(), text: display },
    ]);
    setDraft("");
    setTyping(true);

    if (step === "email" && !(await submitSignup(next))) {
      setTyping(false);
      setMessages((m) => {
        const withoutAnswer = m.slice(0, -1);
        let lastQuestion = -1;
        withoutAnswer.forEach((msg, i) => {
          if (msg.kind === "question") lastQuestion = i;
        });
        return withoutAnswer.map((msg, i) => (i === lastQuestion && msg.kind === "question" ? { ...msg, active: true } : msg));
      });
      setDraft(text);
      setError(tr(lng, "errors.submitFailed"));
      setBusyState(false);
      return;
    }

    const aiReply = wantsAiReply(step, text) ? fetchAiReply(step, next) : Promise.resolve(null);
    const [written] = await Promise.all([aiReply, sleep(MIN_TYPING_MS)]);
    setTyping(false);
    await say(written ?? prewritten);

    const upcoming = nextStep(step);
    if (!upcoming) {
      setDone(true);
      return;
    }
    await sleep(QUESTION_DELAY_MS);
    ask(upcoming, next);
    setBusyState(false);
  };

  const submitDraft = () => {
    if (!activeStep) return;
    void answer(activeStep, [], draft);
  };

  const lng = answers.uiLanguage;
  const placeholder = activeStep ? placeholderFor(activeStep, answers) : "";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
      <div ref={listRef} className="flex flex-1 flex-col justify-end gap-5 pb-4 pt-24">
        <div role="log" aria-live="polite" className="flex flex-col gap-5">
          {messages.map((m) => {
            if (m.kind === "assistant") {
              return <AssistantMessage key={m.id} text={m.text} animate={m.animate} onTyped={() => handleTyped(m.id)} />;
            }
            if (m.kind === "user") return <UserBubble key={m.id}>{m.text}</UserBubble>;
            return (
              <QuestionCard
                key={m.id}
                title={m.title}
                why={m.why}
                active={m.active}
                aside={
                  <StepProgress
                    step={m.step}
                    label={tr(m.lng, "progress", { current: String(stepNumber(m.step)), total: String(TOTAL_STEPS) })}
                  />
                }
              />
            );
          })}
        </div>

        {typing && <TypingIndicator label={tr(lng, "typing")} />}

        {activeStep && (chipSet || inputs?.skippable) && (
          <div className={cn("flex flex-wrap gap-2", ENTER)}>
            {chipSet?.chips.map((chip) => (
              <button key={chip.id} type="button" onClick={() => void answer(activeStep, [chip], "")} className={CHIP}>
                {chip.label}
              </button>
            ))}
            {inputs?.skippable && (
              <button type="button" onClick={() => void answer(activeStep, [], "", true)} className={CHIP}>
                {tr(lng, "skip")}
              </button>
            )}
          </div>
        )}

        {done && (
          <div className={cn("flex justify-center pt-2", ENTER)}>
            <button type="button" onClick={() => navigate("/")} className={cn(CHIP, "px-6 py-2.5")}>
              {tr(lng, "backHome")}
            </button>
          </div>
        )}
      </div>

      {activeStep && inputs?.text ? (
        <ChatComposer
          inputRef={inputRef}
          type={activeStep === "email" ? "email" : "text"}
          value={draft}
          onChange={(value) => {
            setDraft(value);
            if (error) setError(null);
          }}
          onSubmit={submitDraft}
          maxLength={MAX_LENGTH[activeStep]}
          placeholder={placeholder}
          ariaLabel={activeQuestion?.title || placeholder}
          sendLabel={tr(lng, "send")}
          autoComplete={activeStep === "email" ? "email" : activeStep === "name" ? "name" : "off"}
          error={error}
        />
      ) : (
        <ChatComposerSpace />
      )}
    </div>
  );
}

export default WaitlistChat;
