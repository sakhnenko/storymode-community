import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import i18n, { type LanguageCode } from "@/i18n";
import { supabase } from "@/integrations/supabase/client";
import { Upload } from "@/components/ui/icons";
import {
  AssistantMessage,
  CHIP,
  CHIP_ON,
  ChatComposer,
  ChatComposerSpace,
  ENTER,
  GLASS_EDGE,
  GLASS_RAISED,
  QuestionCard,
  TypingIndicator,
  UserBubble,
} from "@/components/chat/ChatKit";
import { nextChatId, prefersReducedMotion, sleep, useStickToBottom, useTypingGate } from "@/components/chat/chat-script";
import { Confetti } from "@/components/chat/Confetti";
import { SetupProgress } from "@/components/welcome/SetupProgress";
import { DETAIL_CHIPS, PROJECT_KEYS, type ProjectKey } from "@/lib/waitlist-flow";
import { countWords } from "@/lib/chapter-stats";
import {
  DOCUMENT_ACCEPT,
  EMPTY_SETUP,
  MAX_TITLE_CHARS,
  MAX_UPLOAD_BYTES,
  MIN_CHAPTER_WORDS,
  documentKind,
  joinList,
  parseSetupEvents,
  passwordProblem,
  projectKeyForLabel,
  textToChapterHtml,
  type SetupEvent,
  type SetupState,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

type Stage =
  | "busy"
  | "name"
  | "password"
  | "ready"
  | "project"
  | "detail"
  | "premise"
  | "title"
  | "chapter"
  | "paste"
  | "upload"
  | "failed"
  | "exhausted"
  | "blocked"
  | "done";

type Message =
  | { kind: "assistant"; id: string; text: string; animate: boolean }
  | { kind: "user"; id: string; text: string }
  | { kind: "question"; id: string; title: string; why: string; active: boolean }
  | { kind: "progress"; id: string }
  | { kind: "finish"; id: string };

interface Chapter {
  html: string;
  words: number;
}

/** blocked: a later project hit the plan's project limit or the credits ran out. */
type SetupOutcome = "ok" | "failed" | "exhausted" | "credits" | "busy" | "limit";

export interface WelcomeChatProps {
  lng: LanguageCode;
  userId: string;
  email: string;
  /** Empty when we don't know their name yet; the chat then asks for it. */
  firstName: string;
  /** Invited accounts choose their password here, once, as the last step. */
  needsPassword: boolean;
  /**
   * "password" when onboarding is already done and only the password is missing;
   * "newProject" for a later project from the dashboard: no welcome, name or password,
   * the genre and premise asked here, and the AI planning charged to their credits.
   */
  mode: "full" | "password" | "newProject";
  /** What they told the waitlist their project is about, if anything. */
  premise: string | null;
  projectType: string | null;
  projectDetail: string | null;
}

const MIN_TYPING_MS = 700;
const MAX_NAME_CHARS = 80;
const MAX_PASSWORD_CHARS = 128;
const QUESTION_DELAY_MS = 350;
const WELCOME_TIMEOUT_MS = 9000;
const DISMISS_TIMEOUT_MS = 2500;
const MAX_DETAIL_CHARS = 200;
const MAX_PREMISE_CHARS = 600;

async function fetchWelcomeLine(): Promise<string | null> {
  try {
    const result = await Promise.race([
      supabase.functions.invoke("onboarding-setup", { body: { action: "welcome" } }),
      sleep(WELCOME_TIMEOUT_MS).then(() => null),
    ]);
    const message = result && !result.error ? result.data?.message : null;
    return typeof message === "string" && message.trim() ? message.trim() : null;
  } catch {
    return null;
  }
}

async function readDocument(file: File): Promise<Chapter | "unsupported" | "tooLarge" | "failed"> {
  const kind = documentKind(file.name);
  if (!kind) return "unsupported";
  if (file.size > MAX_UPLOAD_BYTES) return "tooLarge";
  try {
    if (kind === "text") {
      const text = await file.text();
      return { html: textToChapterHtml(text), words: countWords(text) };
    }
    const form = new FormData();
    form.append("file", file);
    const { data, error } = await supabase.functions.invoke("document-to-text", { body: form });
    if (error || typeof data?.text !== "string") return "failed";
    const html = typeof data.html === "string" && data.html.trim() ? data.html : textToChapterHtml(data.text);
    return { html, words: countWords(data.text) };
  } catch {
    return "failed";
  }
}

async function streamSetup(
  action: "create" | "project",
  body: Record<string, unknown>,
  onEvent: (event: SetupEvent) => void,
): Promise<SetupOutcome> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return "failed";
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-setup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ action, ...body }),
    });
    if (resp.status === 429) return "exhausted";
    if (resp.status === 402) return "credits";
    if (resp.status === 409) return "busy";
    if (resp.status === 403) return "limit";
    if (!resp.ok || !resp.body) return "failed";
    if ((resp.headers.get("content-type") ?? "").includes("application/json")) {
      const data = await resp.json();
      if (data?.done && typeof data.projectId === "string") {
        onEvent({ type: "done", projectId: data.projectId });
        return "ok";
      }
      return "failed";
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finished = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseSetupEvents(done ? `${buffer}\n` : buffer);
      buffer = rest;
      for (const event of events) {
        if (event.type === "error") return "failed";
        onEvent(event);
        if (event.type === "done") finished = true;
      }
      if (done) break;
    }
    return finished ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

export function WelcomeChat({
  lng,
  userId,
  email,
  firstName,
  needsPassword,
  mode,
  premise,
  projectType,
  projectDetail,
}: WelcomeChatProps) {
  const navigate = useNavigate();
  const reduceMotion = useMemo(prefersReducedMotion, []);
  const t = useCallback(
    (key: string, vars?: Record<string, unknown>) => i18n.t(`welcomeChat.${key}`, { lng, ...vars }),
    [lng],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [stage, setStage] = useState<Stage>("busy");
  const stageRef = useRef<Stage>("busy");
  const [typing, setTyping] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const [draft, setDraft] = useState("");
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupState>(EMPTY_SETUP);
  const [dragging, setDragging] = useState(false);

  const project = useRef({
    key: projectKeyForLabel(projectType),
    type: projectType ?? "",
    detail: projectDetail ?? "",
    title: "",
    premise: "",
    chapter: null as Chapter | null,
  });
  const createdProjectId = useRef<string | null>(null);
  const newProject = mode === "newProject";
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedRef = useRef(false);
  const welcomeLine = useRef<Promise<string | null>>(Promise.resolve(null));
  const enteredName = useRef("");
  const passwordPending = useRef(needsPassword);
  const { wait: waitTyped, release: handleTyped } = useTypingGate();
  useStickToBottom(listRef);

  const goTo = useCallback((next: Stage) => {
    stageRef.current = next;
    setStage(next);
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

  const reply = useCallback(
    async (text: string) => {
      setTyping(true);
      await sleep(MIN_TYPING_MS);
      setTyping(false);
      await say(text);
    },
    [say],
  );

  const ask = useCallback(
    async (key: "name" | "password" | "ready" | "project" | "title" | "chapter" | "detail" | "premise", next: Stage) => {
      await sleep(QUESTION_DELAY_MS);
      // Genre and premise use the waitlist's questions, which writers have already seen.
      const copy =
        key === "detail" ? `waitlistChat.questions.detail.${project.current.key}`
        : key === "premise" ? "waitlistChat.questions.premise"
        : `welcomeChat.questions.${key}`;
      setMessages((m) => [
        ...m,
        {
          kind: "question",
          id: nextChatId(),
          title: i18n.t(`${copy}.title`, { lng }),
          why: i18n.t(`${copy}.why`, { lng }),
          active: true,
        },
      ]);
      goTo(next);
    },
    [goTo, lng],
  );

  /** Records the visitor's answer: settles the open question and shows their bubble. */
  const answered = useCallback(
    (text: string) => {
      goTo("busy");
      setError(null);
      setDraft("");
      setMessages((m) => [
        ...m.map((msg) => (msg.kind === "question" && msg.active ? { ...msg, active: false } : msg)),
        { kind: "user", id: nextChatId(), text },
      ]);
    },
    [goTo],
  );

  /** Takes back the last answer and reopens its question, e.g. after a failed save. */
  const undoAnswer = useCallback(() => {
    setMessages((m) => {
      const kept = m.slice(0, -1);
      const last = kept.map((msg) => msg.kind).lastIndexOf("question");
      return kept.map((msg, i) => (i === last && msg.kind === "question" ? { ...msg, active: true } : msg));
    });
  }, []);

  const continueWelcome = useCallback(async () => {
    setTyping(true);
    const [line] = await Promise.all([welcomeLine.current, sleep(MIN_TYPING_MS)]);
    setTyping(false);
    await say(line ?? t(`intro.${project.current.key ?? "default"}`));
    await reply(t("offer"));
    await ask("ready", "ready");
  }, [ask, reply, say, t]);

  /** Every way out of the chat ends here: the password if it's still missing, then the dashboard. */
  const finish = useCallback(
    async (intro?: string) => {
      if (intro) await reply(intro);
      if (passwordPending.current) {
        await ask("password", "password");
        return;
      }
      setMessages((m) => [...m, { kind: "finish", id: nextChatId() }]);
      goTo("done");
    },
    [ask, goTo, reply],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      if (mode === "newProject") {
        await say(t("newProject.intro"));
        await ask("project", "project");
        return;
      }
      if (mode === "password") {
        await say(firstName ? t("replies.welcomeBack", { name: firstName }) : t("replies.welcomeBackNoName"));
        await finish();
        return;
      }
      welcomeLine.current = fetchWelcomeLine();
      setConfetti((n) => n + 1);
      await say(firstName ? t("congrats", { name: firstName }) : t("congratsNoName"));
      if (!firstName) await ask("name", "name");
      else await continueWelcome();
    })();
  }, [ask, continueWelcome, finish, firstName, mode, say, t]);

  const runSetup = async () => {
    goTo("busy");
    await reply(t("replies.working"));
    setSetup(EMPTY_SETUP);
    setMessages((m) => [...m.filter((msg) => msg.kind !== "progress"), { kind: "progress", id: nextChatId() }]);

    let projectId: string | null = null;
    let state = EMPTY_SETUP;
    const update = (next: SetupState) => {
      state = next;
      setSetup(next);
    };
    const outcome = await streamSetup(
      newProject ? "project" : "create",
      {
        premise: project.current.premise,
        title: project.current.title,
        chapterHtml: project.current.chapter?.html ?? "",
        projectKey: project.current.key,
        projectType: project.current.type,
        projectDetail: project.current.detail,
      },
      (event) => {
        switch (event.type) {
          case "project":
            update({ ...state, project: event.title });
            break;
          case "planning":
            update({ ...state, planning: { fromChapter: event.fromChapter } });
            break;
          case "folio":
            update({ ...state, folios: [...state.folios, { title: event.title, icon: event.icon, notebooks: event.notebooks }] });
            break;
          case "chapter":
            update({ ...state, chapter: event.title });
            break;
          case "fallback":
            update({ ...state, fallback: true });
            break;
          case "codex":
            update({ ...state, codex: true });
            break;
          case "done":
            projectId = event.projectId;
            update({ ...state, finished: true });
            break;
        }
      },
    );

    if (outcome !== "ok" || !projectId) {
      setMessages((m) => m.filter((msg) => msg.kind !== "progress"));
      if (outcome === "credits" || outcome === "limit" || outcome === "busy") {
        await reply(t(`newProject.${outcome}`));
        goTo(outcome === "busy" ? "failed" : "blocked");
        return;
      }
      await reply(t(outcome === "exhausted" ? "replies.exhausted" : "replies.failed"));
      goTo(outcome === "exhausted" ? "exhausted" : "failed");
      return;
    }
    createdProjectId.current = projectId;

    setConfetti((n) => n + 1);
    const title = project.current.title;
    const folios = state.folios.map((f) => f.title);
    const list = joinList(folios, t("and"));
    await finish(
      folios.length === 0
        ? t("replies.ready", { title })
        : state.fallback && state.chapter
          ? t("replies.doneFallback", { title, chapter: state.chapter, folios: list })
          : state.chapter
            ? t(state.codex ? "replies.doneWithCodex" : "replies.doneWithChapter", {
                title,
                count: folios.length,
                folios: list,
                chapter: state.chapter,
              })
            : t("replies.done", { title, count: folios.length, folios: list }),
    );
  };

  const chooseName = async (typed: string) => {
    const name = typed.trim().slice(0, MAX_NAME_CHARS);
    if (!name) {
      setError(t("errors.nameRequired"));
      return;
    }
    enteredName.current = name;
    answered(name);
    void supabase.from("profiles").update({ display_name: name }).eq("user_id", userId).then(() => {}, () => {});
    await reply(t("replies.name", { name: name.split(/\s+/)[0] }));
    await continueWelcome();
  };

  const choosePassword = async (password: string) => {
    const problem = passwordProblem(password);
    if (problem) {
      setError(i18n.t(`auth.${problem}`, { lng }));
      return;
    }
    answered("••••••••");
    setTyping(true);
    const name = enteredName.current;
    const [{ error: updateError }] = await Promise.all([
      supabase.auth.updateUser({
        password,
        data: name ? { password_set: true, display_name: name, full_name: name } : { password_set: true },
      }),
      sleep(MIN_TYPING_MS),
    ]);
    setTyping(false);
    if (updateError) {
      undoAnswer();
      setError(updateError.message || i18n.t("auth.couldntSetPassword", { lng }));
      goTo("password");
      return;
    }
    passwordPending.current = false;
    try {
      sessionStorage.removeItem("pending_password_setup");
      sessionStorage.removeItem("password_setup_flow");
    } catch {
      // storage unavailable; nothing to clean up
    }
    await say(t("replies.passwordSet"));
    await finish();
  };

  const chooseReady = async (yes: boolean) => {
    answered(t(yes ? "options.yes" : "options.later"));
    if (!yes) {
      await Promise.race([
        supabase.functions.invoke("onboarding-setup", { body: { action: "dismiss" } }).catch(() => null),
        sleep(DISMISS_TIMEOUT_MS),
      ]);
      if (passwordPending.current) {
        await finish(t("replies.laterPassword"));
        return;
      }
      navigate("/dashboard", { replace: true });
      return;
    }
    // The waitlist already asked; the premise alone tells the AI enough about the project.
    if (project.current.type || premise) {
      await ask("title", "title");
    } else {
      await ask("project", "project");
    }
  };

  const chooseProject = async (key: ProjectKey | null, typed: string) => {
    const label = key ? i18n.t(`waitlistChat.options.projects.${key}`, { lng }) : typed.trim();
    if (!label) return;
    project.current.key = key;
    project.current.type = key ? i18n.t(`waitlistChat.options.projects.${key}`, { lng: "en" }) : label;
    answered(label);
    await reply(t("replies.project"));
    if (!newProject) {
      await ask("title", "title");
      return;
    }
    if (key) await ask("detail", "detail");
    else await ask("premise", "premise");
  };

  const chooseDetail = async (chip: { label: string; value: string } | null, typed: string) => {
    const label = chip ? chip.label : typed.trim().slice(0, MAX_DETAIL_CHARS);
    if (!label) return;
    project.current.detail = chip ? chip.value : label;
    answered(label);
    await ask("premise", "premise");
  };

  const choosePremise = async (typed: string | null) => {
    const premiseText = (typed ?? "").trim().slice(0, MAX_PREMISE_CHARS);
    if (typed !== null && !premiseText) return;
    project.current.premise = premiseText;
    answered(typed === null ? i18n.t("waitlistChat.skip", { lng }) : premiseText);
    await ask("title", "title");
  };

  const chooseTitle = async (typed: string) => {
    const title = typed.trim().slice(0, MAX_TITLE_CHARS);
    if (!title) {
      setError(t("errors.titleRequired"));
      return;
    }
    project.current.title = title;
    answered(title);
    await reply(t("replies.title", { title }));
    await ask("chapter", "chapter");
  };

  const startFresh = async () => {
    project.current.chapter = null;
    answered(t("options.fresh"));
    await reply(t("replies.fresh"));
    await runSetup();
  };

  const submitPasted = async () => {
    const words = countWords(pasted);
    if (words < MIN_CHAPTER_WORDS) {
      setError(t("replies.tooShort"));
      return;
    }
    project.current.chapter = { html: textToChapterHtml(pasted), words };
    answered(t("attachment.pasted", { words: t("paste.words", { count: words }) }));
    setPasted("");
    await reply(t("replies.pasted", { count: words }));
    await runSetup();
  };

  const submitFile = async (file: File) => {
    if (stageRef.current !== "upload") return;
    answered(t("attachment.file", { file: file.name }));
    setTyping(true);
    const [result] = await Promise.all([readDocument(file), sleep(MIN_TYPING_MS)]);
    setTyping(false);
    if (typeof result === "string" || result.words < MIN_CHAPTER_WORDS) {
      const reason =
        result === "unsupported" ? "unsupported" : result === "tooLarge" ? "tooLarge" : result === "failed" ? "readFailed" : "tooShort";
      await say(t(`replies.${reason}`));
      await ask("chapter", "chapter");
      return;
    }
    project.current.chapter = result;
    await say(t("replies.uploaded", { count: result.words, file: file.name }));
    await runSetup();
  };

  const retry = async () => {
    answered(t("options.retry"));
    await runSetup();
  };

  const toDashboard = async () => {
    if (newProject) {
      navigate("/dashboard", { replace: true });
      return;
    }
    // Mark onboarding dismissed so the dashboard doesn't bounce us back here.
    await Promise.race([
      supabase.functions.invoke("onboarding-setup", { body: { action: "dismiss" } }).catch(() => null),
      sleep(DISMISS_TIMEOUT_MS),
    ]);
    if (!passwordPending.current) {
      navigate("/dashboard", { replace: true });
      return;
    }
    answered(t("options.dashboard"));
    await finish();
  };

  useEffect(() => {
    if (stage === "name" || stage === "password" || stage === "title" || stage === "project" || stage === "detail" || stage === "premise") {
      inputRef.current?.focus();
    }
  }, [stage]);

  const composer: {
    placeholder: string;
    submit: () => void;
    maxLength: number;
    type?: "text" | "password";
    autoComplete?: string;
  } | null =
    stage === "name"
      ? { placeholder: t("questions.name.placeholder"), submit: () => void chooseName(draft), maxLength: MAX_NAME_CHARS, autoComplete: "name" }
      : stage === "password"
        ? {
            placeholder: t("questions.password.placeholder"),
            submit: () => void choosePassword(draft),
            maxLength: MAX_PASSWORD_CHARS,
            type: "password",
            autoComplete: "new-password",
          }
        : stage === "title"
          ? { placeholder: t("questions.title.placeholder"), submit: () => void chooseTitle(draft), maxLength: MAX_TITLE_CHARS }
          : stage === "project"
            ? { placeholder: t("questions.project.placeholder"), submit: () => void chooseProject(null, draft), maxLength: MAX_TITLE_CHARS }
            : stage === "detail"
              ? { placeholder: i18n.t("waitlistChat.questions.detail.placeholder", { lng }), submit: () => void chooseDetail(null, draft), maxLength: MAX_DETAIL_CHARS }
              : stage === "premise"
                ? { placeholder: i18n.t("waitlistChat.questions.premise.placeholder", { lng }), submit: () => void choosePremise(draft), maxLength: MAX_PREMISE_CHARS }
                : null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
      <Confetti fireKey={confetti} />
      <div ref={listRef} className="flex flex-1 flex-col justify-end gap-5 pb-4 pt-24">
        <div role="log" aria-live="polite" className="flex flex-col gap-5">
          {messages.map((m) => {
            switch (m.kind) {
              case "assistant":
                return <AssistantMessage key={m.id} text={m.text} animate={m.animate} onTyped={() => handleTyped(m.id)} />;
              case "user":
                return <UserBubble key={m.id}>{m.text}</UserBubble>;
              case "question":
                return <QuestionCard key={m.id} title={m.title} why={m.why} active={m.active} />;
              case "progress":
                return <SetupProgress key={m.id} lng={lng} state={setup} />;
              case "finish":
                return (
                  <div key={m.id} className={cn("flex justify-center pt-1", ENTER)}>
                    <button
                      type="button"
                      onClick={() => navigate(
                        newProject && createdProjectId.current ? `/project/${createdProjectId.current}` : "/dashboard",
                        { replace: true },
                      )}
                      className={cn(CHIP, CHIP_ON, "px-7 py-3 text-base shadow-lg")}
                    >
                      {newProject ? t("newProject.open", { title: project.current.title }) : t("toProjects")}
                    </button>
                  </div>
                );
            }
          })}
        </div>

        {typing && <TypingIndicator label={t("typing")} />}

        {stage === "ready" && (
          <div className={cn("flex flex-wrap gap-2", ENTER)}>
            <button type="button" onClick={() => void chooseReady(true)} className={cn(CHIP, CHIP_ON)}>
              {t("options.yes")}
            </button>
            <button type="button" onClick={() => void chooseReady(false)} className={CHIP}>
              {t("options.later")}
            </button>
          </div>
        )}

        {stage === "project" && (
          <div className={cn("flex flex-wrap gap-2", ENTER)}>
            {PROJECT_KEYS.map((key) => (
              <button key={key} type="button" onClick={() => void chooseProject(key, "")} className={CHIP}>
                {i18n.t(`waitlistChat.options.projects.${key}`, { lng })}
              </button>
            ))}
          </div>
        )}

        {stage === "detail" && project.current.key && (
          <div className={cn("flex flex-wrap gap-2", ENTER)}>
            {DETAIL_CHIPS[project.current.key].ids.map((id) => {
              const group = DETAIL_CHIPS[project.current.key!].group;
              const chip = {
                label: i18n.t(`waitlistChat.options.${group}.${id}`, { lng }),
                value: i18n.t(`waitlistChat.options.${group}.${id}`, { lng: "en" }),
              };
              return (
                <button key={id} type="button" onClick={() => void chooseDetail(chip, "")} className={CHIP}>
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}

        {stage === "premise" && (
          <div className={cn("flex flex-wrap gap-2", ENTER)}>
            <button type="button" onClick={() => void choosePremise(null)} className={CHIP}>
              {i18n.t("waitlistChat.skip", { lng })}
            </button>
          </div>
        )}

        {stage === "blocked" && (
          <div className={cn("flex flex-wrap gap-2", ENTER)}>
            <button type="button" onClick={() => navigate("/plans")} className={cn(CHIP, CHIP_ON)}>
              {t("newProject.plans")}
            </button>
            <button type="button" onClick={() => void toDashboard()} className={CHIP}>
              {t("options.dashboard")}
            </button>
          </div>
        )}

        {stage === "chapter" && (
          <div className={cn("flex flex-wrap gap-2", ENTER)}>
            <button type="button" onClick={() => { setError(null); goTo("paste"); }} className={CHIP}>
              {t("options.paste")}
            </button>
            <button type="button" onClick={() => { setError(null); goTo("upload"); }} className={CHIP}>
              {t("options.upload")}
            </button>
            <button type="button" onClick={() => void startFresh()} className={CHIP}>
              {t("options.fresh")}
            </button>
          </div>
        )}

        {stage === "paste" && (
          <div className={cn("rounded-3xl bg-white/95 p-3", ENTER, GLASS_EDGE, GLASS_RAISED)}>
            <textarea
              autoFocus
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                if (error) setError(null);
              }}
              placeholder={t("paste.placeholder")}
              aria-label={t("paste.placeholder")}
              className="h-56 w-full resize-y rounded-2xl bg-transparent p-3 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            {error && <p role="alert" className="px-3 pb-2 text-sm text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <span className="text-sm text-muted-foreground">{t("paste.words", { count: countWords(pasted) })}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => goTo("chapter")} className={CHIP}>
                  {t("paste.back")}
                </button>
                <button type="button" disabled={!pasted.trim()} onClick={() => void submitPasted()} className={cn(CHIP, CHIP_ON)}>
                  {t("paste.use")}
                </button>
              </div>
            </div>
          </div>
        )}

        {stage === "upload" && (
          <div className={cn("flex flex-col gap-2", ENTER)}>
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void submitFile(file);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-3 rounded-3xl border-2 border-dashed px-6 py-8 text-center backdrop-blur-xl transition-colors",
                "focus-within:ring-2 focus-within:ring-primary/60",
                dragging ? "border-primary bg-white" : "border-white/80 bg-white/85",
              )}
            >
              <Upload className="h-7 w-7 text-primary" aria-hidden="true" />
              <span className="font-semibold text-foreground">{t("upload.prompt")}</span>
              <span className={cn(CHIP, CHIP_ON)}>{t("upload.choose")}</span>
              <span className="text-xs text-muted-foreground">{t("upload.hint")} · .docx · .pdf · .txt</span>
              <input
                type="file"
                accept={DOCUMENT_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void submitFile(file);
                }}
              />
            </label>
            <div>
              <button type="button" onClick={() => goTo("chapter")} className={CHIP}>
                {t("upload.back")}
              </button>
            </div>
          </div>
        )}

        {(stage === "failed" || stage === "exhausted") && (
          <div className={cn("flex flex-wrap gap-2", ENTER)}>
            {stage === "failed" && (
              <button type="button" onClick={() => void retry()} className={cn(CHIP, CHIP_ON)}>
                {t("options.retry")}
              </button>
            )}
            <button type="button" onClick={() => void toDashboard()} className={CHIP}>
              {t("options.dashboard")}
            </button>
          </div>
        )}
      </div>

      {composer ? (
        <ChatComposer
          inputRef={inputRef}
          value={draft}
          onChange={(value) => {
            setDraft(value);
            if (error) setError(null);
          }}
          onSubmit={composer.submit}
          type={composer.type}
          autoComplete={composer.autoComplete}
          maxLength={composer.maxLength}
          placeholder={composer.placeholder}
          ariaLabel={composer.placeholder}
          sendLabel={t("send")}
          revealLabels={composer.type === "password" ? { show: t("showPassword"), hide: t("hidePassword") } : undefined}
          username={composer.type === "password" ? email : undefined}
          error={error}
        />
      ) : (
        <ChatComposerSpace />
      )}
    </div>
  );
}

export default WelcomeChat;
