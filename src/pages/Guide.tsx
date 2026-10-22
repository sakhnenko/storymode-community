import { Seo } from "@/components/seo/Seo";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { pickRandomBackground } from "@/lib/backgrounds";
import { BackgroundCredit, useBackgroundPreload } from "@/components/layout/BackgroundCredit";
import { PublicNav } from "@/components/layout/PublicNav";
import dashboardScreenshot from "@/assets/dashboard-screenshot.webp";
import projectsVideo from "@/assets/projects.mp4.asset.json";
import starterProject from "@/assets/starter-project.webp";
import notebookThemes from "@/assets/notebook-themes.webp";
import editorThemeVideo from "@/assets/editor-theme.mp4.asset.json";
import fontSizeTheme from "@/assets/font-size-theme.webp";
import focusMode from "@/assets/focus-mode.webp";
import writingFormatting from "@/assets/writing-formatting.webp";
import aiEditorShot from "@/assets/guide/ai-editor.webp";
import aiEditorVideo from "@/assets/guide/ai-editor.mp4.asset.json";
import chatSelectionShot from "@/assets/guide/chat-selection.webp";
import chatVideo from "@/assets/guide/chat.mp4.asset.json";
import chatBookwideShot from "@/assets/guide/chat-bookwide.webp";
import chatPlotholeShot from "@/assets/guide/chat-plothole.webp";
import chatReviewShot from "@/assets/guide/chat-review.webp";
import byokKeyShot from "@/assets/guide/byok-key.webp";
import timelineDatesVideo from "@/assets/guide/timeline-dates.mp4.asset.json";
import timelineZoomVideo from "@/assets/guide/timeline-zoom.mp4.asset.json";
import timelinePreviewShot from "@/assets/guide/timeline-preview.webp";
import mapPointerVideo from "@/assets/guide/map-pointer.mp4.asset.json";
import mapPanVideo from "@/assets/guide/map-pan.mp4.asset.json";
import mapPencilVideo from "@/assets/guide/map-pencil.mp4.asset.json";
import mapFillShot from "@/assets/guide/map-fill.webp";
import mapEyedropperShot from "@/assets/guide/map-eyedropper.webp";
import mapBrushShot from "@/assets/guide/map-brush.webp";
import mapLabelsVideo from "@/assets/guide/map-labels.mp4.asset.json";
import mapNoteVideo from "@/assets/guide/map-note.mp4.asset.json";
import aiDrawVideo from "@/assets/guide/ai-draw.mp4.asset.json";
import {
  ArrowLeft,
  PencilSimple,
  ChatCircleDots,
  ClockClockwise,
  MapTrifold,
  Sparkle,
  ImageSquare,
  BookOpen,
  Globe,
  CreditCard,
  Notebook,
  ListBullets,
  Play,
  Palette,
  X,
  type IconProps,
} from "@/components/ui/icons";

type PlanTier = "manuscript" | "studio";
type Subsection = { id: string; media?: "image" | "video"; plan?: PlanTier };
type Topic = {
  id: string;
  icon: React.ComponentType<IconProps>;
  subsections: Subsection[];
};

const TOPICS: Topic[] = [
  {
    id: "getting-started",
    icon: BookOpen,
    subsections: [
      { id: "dashboard", media: "image" },
      { id: "projects", media: "image" },
      { id: "starter", media: "image" },
    ],
  },
  {
    id: "themes",
    icon: Palette,
    subsections: [
      { id: "notebook-theme", media: "image" },
      { id: "editor-theme", media: "video" },
      { id: "font-size", media: "image" },
    ],
  },
  {
    id: "story-editor",
    icon: PencilSimple,
    subsections: [
      { id: "focus", media: "image" },
      { id: "formatting", media: "image" },
      { id: "autosave", media: "image" },
      { id: "scroll-memory", media: "image" },
      { id: "history", media: "image" },
      { id: "chapters", media: "image" },
    ],
  },
  {
    id: "ai-editor",
    icon: Sparkle,
    subsections: [
      { id: "opinions", media: "video", plan: "manuscript" },
      { id: "feedback-examples", media: "image", plan: "manuscript" },
    ],
  },
  {
    id: "chat",
    icon: ChatCircleDots,
    subsections: [
      { id: "asking", media: "video", plan: "manuscript" },
      { id: "selection", media: "image", plan: "manuscript" },
      { id: "use-cases", media: "image", plan: "manuscript" },
    ],
  },
  {
    id: "timeline",
    icon: ClockClockwise,
    subsections: [
      { id: "dates", media: "video" },
      { id: "pan-zoom", media: "video" },
      { id: "previews", media: "image" },
    ],
  },
  {
    id: "map",
    icon: MapTrifold,
    subsections: [
      { id: "pointer", media: "image" },
      { id: "pan", media: "image" },
      { id: "pencil", media: "video" },
      { id: "fill", media: "image" },
      { id: "eyedropper", media: "image" },
      { id: "brush", media: "image" },
      { id: "label", media: "video" },
      { id: "notebook-pill", media: "video" },
      { id: "delete-tool" },
      { id: "undo" },
    ],
  },
  {
    id: "ai-draw",
    icon: ImageSquare,
    subsections: [
      { id: "stickers", media: "video", plan: "studio" },
    ],
  },
  {
    id: "scan",
    icon: Notebook,
    subsections: [{ id: "scanning", media: "video", plan: "manuscript" }],
  },
  {
    id: "sharing",
    icon: Globe,
    subsections: [
      { id: "private", media: "image" },
      { id: "public", media: "image" },
    ],
  },
  {
    id: "plans-credits",
    icon: CreditCard,
    subsections: [
      { id: "watching", media: "image" },
      { id: "topups", media: "image" },
      { id: "byok", media: "image" },
      { id: "plans", media: "image" },
    ],
  },
];

function MediaPlaceholder({ kind }: { kind: "image" | "video" }) {
  const { t } = useTranslation();
  return (
    <div
      className="my-4 rounded-lg border border-dashed flex items-center justify-center text-xs tracking-wide"
      style={{
        borderColor: "rgba(243,234,214,0.25)",
        background: "rgba(0,0,0,0.25)",
        color: "rgba(243,234,214,0.55)",
        height: 220,
        fontFamily: "'Boulder Mono', monospace",
      }}
    >
      {kind === "video" ? (
        <span className="flex items-center gap-2"><Play weight="fill" className="w-4 h-4" /> {t("guide.videoPlaceholder")}</span>
      ) : (
        <span className="flex items-center gap-2"><ImageSquare weight="duotone" className="w-4 h-4" /> {t("guide.imagePlaceholder")}</span>
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: PlanTier }) {
  const { t } = useTranslation();
  const isStudio = plan === "studio";
  const label = isStudio ? t("guide.planStudio") : t("guide.planManuscript");
  const color = isStudio ? "#e0b46b" : "#c9a880";
  return (
    <span
      title={t("guide.planAvailable", { plan: label })}
      className="inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10px] uppercase tracking-[0.12em] align-middle"
      style={{
        fontFamily: "'Boulder Mono', monospace",
        color,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${color}55`,
      }}
    >
      <Sparkle weight="fill" className="w-2.5 h-2.5" /> {label}
    </span>
  );
}

function FullscreenImage({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full transition-colors"
        onClick={onClose}
        aria-label={t("guide.closeFullscreen")}
      >
        <X weight="bold" className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[95vw] max-h-[95vh] object-contain rounded shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function AutoplayVideo({ src, ariaLabel }: { src: string; ariaLabel: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasPlayedRef.current) {
            hasPlayedRef.current = true;
            el.play().catch(() => {});
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      className="block w-full h-auto my-4 rounded-lg overflow-hidden border border-white/10 bg-black"
      controls
      loop
      muted
      playsInline
      preload="metadata"
      aria-label={ariaLabel}
    />
  );
}

export default function Guide() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [background] = useState(() => pickRandomBackground());
  useBackgroundPreload(background.url);

  const initialTopic = useMemo(() => {
    const hash = location.hash.replace("#", "");
    const topic = TOPICS.find((t) => t.id === hash || t.subsections.some((s) => s.id === hash));
    return topic?.id ?? TOPICS[0].id;
  }, [location.hash]);

  const [activeTopic, setActiveTopic] = useState<string>(initialTopic);
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; alt: string } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // scroll to top of content when topic changes
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTopic]);

  const topic = TOPICS.find((t) => t.id === activeTopic) ?? TOPICS[0];

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat relative overflow-x-hidden"
      style={{ backgroundImage: `url("${background.url}")` }}
    >
      <Seo
        title="StoryMode Guide — Write Stories. Create Worlds."
        description="Learn how to use StoryMode: chapter drafts, folios of notes, the AI Editor, interactive timelines, story maps and AI Draw stickers."
        path="/guide"
      />
      <div className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
      <BackgroundCredit background={background} />

      <PublicNav />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-28 pb-12">
        <button
          onClick={() => navigate(-1)}
          className="text-[#f3ead6]/80 hover:text-[#f3ead6] text-xs flex items-center gap-1.5 mb-6 transition-colors"
        >
          <ArrowLeft weight="bold" className="w-3.5 h-3.5" /> {t("guide.back")}
        </button>

        <div className="mb-8">
          <h1
            className="text-4xl md:text-5xl mb-2"
            style={{
              fontFamily: "'Newsreader', serif",
              fontWeight: 500,
              color: "#f3ead6",
              letterSpacing: "-0.5px",
              textShadow: "0 2px 24px rgba(0,0,0,0.6), 0 1px 2px rgba(0,0,0,0.5)",
            }}
          >
            {t("guide.title")}
          </h1>
          <p className="text-[#f3ead6]/75 text-sm max-w-2xl" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
            {t("guide.subtitle")}
          </p>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 rounded-xl overflow-hidden"
          style={{
            background: "rgba(20,18,16,0.55)",
            backdropFilter: "blur(14px)",
            border: "1px solid rgba(243,234,214,0.08)",
            minHeight: 620,
          }}
        >
          {/* Sidebar */}
          <aside
            className="p-3 md:border-r"
            style={{ borderColor: "rgba(243,234,214,0.08)", background: "rgba(0,0,0,0.25)" }}
          >
            <div
              className="px-2 pt-2 pb-3 text-[10px] uppercase tracking-[0.15em]"
              style={{ color: "rgba(243,234,214,0.45)", fontFamily: "'Boulder Mono', monospace" }}
            >
              {t("guide.topicsLabel")}
            </div>
            <nav className="flex flex-col gap-0.5">
              {TOPICS.map((tp) => {
                const active = tp.id === activeTopic;
                const Icon = tp.icon;
                return (
                  <button
                    key={tp.id}
                    onClick={() => {
                      setActiveTopic(tp.id);
                      window.history.replaceState(null, "", `#${tp.id}`);
                    }}
                    className="flex items-center gap-2.5 text-left px-3 py-2 rounded-md text-[13px] transition-colors"
                    style={{
                      color: active ? "#f3ead6" : "rgba(243,234,214,0.7)",
                      background: active ? "rgba(243,234,214,0.10)" : "transparent",
                      border: `1px solid ${active ? "rgba(243,234,214,0.14)" : "rgba(243,234,214,0.01)"}`,
                    }}
                    onMouseEnter={(e) => {
                      if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(243,234,214,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    <Icon weight={active ? "fill" : "duotone"} className="w-4 h-4 shrink-0" />
                    <span className="truncate">{t(`guide.topics.${tp.id}.title`)}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Content */}
          <section
            ref={contentRef}
            className="p-6 md:p-10 overflow-y-auto"
            style={{ maxHeight: "78vh", color: "#f3ead6" }}
          >
            <div className="flex items-center gap-3 mb-2">
              <topic.icon weight="duotone" className="w-6 h-6 text-[#f3ead6]/80" />
              <h2
                className="text-3xl"
                style={{ fontFamily: "'Newsreader', serif", fontWeight: 500, letterSpacing: "-0.3px" }}
              >
                {t(`guide.topics.${topic.id}.title`)}
              </h2>
            </div>
            <p className="text-[#f3ead6]/75 text-[15px] leading-relaxed max-w-2xl mb-8">{t(`guide.topics.${topic.id}.intro`)}</p>

            {/* Table of contents */}
            <div
              className="mb-10 p-4 rounded-lg"
              style={{ background: "rgba(0,0,0,0.25)", border: "1px solid rgba(243,234,214,0.08)" }}
            >
              <div
                className="flex items-center gap-2 mb-2 text-[10px] uppercase tracking-[0.15em]"
                style={{ color: "rgba(243,234,214,0.5)", fontFamily: "'Boulder Mono', monospace" }}
              >
                <ListBullets weight="duotone" className="w-3.5 h-3.5" /> {t("guide.onThisPage")}
              </div>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                {topic.subsections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        window.history.replaceState(null, "", `#${s.id}`);
                      }}
                      className="text-sm text-[#f3ead6]/75 hover:text-[#f3ead6] transition-colors"
                    >
                      · {t(`guide.topics.${topic.id}.s.${s.id}.title`)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Subsections */}
            <div className="space-y-12">
              {topic.subsections.map((s) => (
                <article key={s.id} id={s.id} className="scroll-mt-6">
                  <div className="flex items-center flex-wrap gap-2 mb-2">
                    <h3
                      className="text-xl"
                      style={{ fontFamily: "'Newsreader', serif", fontWeight: 500, color: "#f3ead6" }}
                    >
                      {t(`guide.topics.${topic.id}.s.${s.id}.title`)}
                    </h3>
                    {s.plan && <PlanBadge plan={s.plan} />}
                  </div>
                  <div className="text-[#f3ead6]/75 leading-relaxed max-w-2xl space-y-4">
                    {(() => {
                      if (s.id === "use-cases") return null;
                      // Split on real blank lines into blocks, then render each
                      // block as either a paragraph or a bulleted list so lines
                      // starting with "- " or "• " render as elegant bullets
                      // instead of getting crunched into a single paragraph.
                      const body = t(`guide.topics.${topic.id}.s.${s.id}.body`);
                      const blocks = body.split(/\n{2,}/);
                      return blocks.map((block, i) => {
                        const lines = block.split("\n");
                        const isList = lines.every((l) => /^\s*[-•]\s+/.test(l));
                        if (isList) {
                          return (
                            <ul key={i} className="list-disc pl-5 space-y-2 marker:text-[#f3ead6]/40">
                              {lines.map((l, j) => (
                                <li key={j}>{l.replace(/^\s*[-•]\s+/, "")}</li>
                              ))}
                            </ul>
                          );
                        }
                        return <p key={i}>{block}</p>;
                      });
                    })()}
                  </div>
                  {s.id === "use-cases" ? (
                    <div className="max-w-2xl space-y-6 text-[#f3ead6]/75 leading-relaxed">
                      <p>
                        <Trans i18nKey="guide.useCases.p1" components={{ b: <strong /> }} />
                      </p>
                      <button
                        className="block w-full rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                        onClick={() => setFullscreenImage({ src: chatBookwideShot, alt: "Asking Chat about a character across chapters" })}
                        aria-label="Open book-wide chat screenshot fullscreen"
                      >
                        <img src={chatBookwideShot} alt="Asking Chat about a character across chapters" className="w-full h-auto object-cover" loading="lazy" />
                      </button>
                      <p>{t("guide.useCases.p2")}</p>
                      <p>{t("guide.useCases.p3")}</p>
                      <button
                        className="block w-full rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                        onClick={() => setFullscreenImage({ src: chatPlotholeShot, alt: "Chat analyzing plot holes across the first three chapters" })}
                        aria-label="Open plot-hole chat screenshot fullscreen"
                      >
                        <img src={chatPlotholeShot} alt="Chat analyzing plot holes across the first three chapters" className="w-full h-auto object-cover" loading="lazy" />
                      </button>
                      <p>{t("guide.useCases.p4")}</p>
                      <button
                        className="block w-full rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                        onClick={() => setFullscreenImage({ src: chatReviewShot, alt: "Chat reviewing a selected passage as a literary editor" })}
                        aria-label="Open selection review screenshot fullscreen"
                      >
                        <img src={chatReviewShot} alt="Chat reviewing a selected passage as a literary editor" className="w-full h-auto object-cover" loading="lazy" />
                      </button>
                      <p>{t("guide.useCases.p5")}</p>
                    </div>
                  ) : s.id === "dashboard" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: dashboardScreenshot, alt: "StoryMode Dashboard" })}
                      aria-label="Open dashboard screenshot fullscreen"
                    >
                      <img
                        src={dashboardScreenshot}
                        alt="StoryMode Dashboard"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "starter" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: starterProject, alt: "The Starter Project" })}
                      aria-label="Open starter project screenshot fullscreen"
                    >
                      <img
                        src={starterProject}
                        alt="The Starter Project"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "notebook-theme" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: notebookThemes, alt: "Notebook Themes" })}
                      aria-label="Open notebook themes screenshot fullscreen"
                    >
                      <img
                        src={notebookThemes}
                        alt="Notebook Themes"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "projects" ? (
                    <AutoplayVideo src={projectsVideo.url} ariaLabel="Projects, Folios and Notebooks walkthrough" />
                  ) : s.id === "editor-theme" ? (
                    <AutoplayVideo src={editorThemeVideo.url} ariaLabel="Editor theme and focus mode walkthrough" />
                  ) : s.id === "font-size" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: fontSizeTheme, alt: "Font & Size options" })}
                      aria-label="Open font and size screenshot fullscreen"
                    >
                      <img
                        src={fontSizeTheme}
                        alt="Font & Size options"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "focus" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: focusMode, alt: "Focus Mode" })}
                      aria-label="Open focus mode screenshot fullscreen"
                    >
                      <img
                        src={focusMode}
                        alt="Focus Mode"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "formatting" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: writingFormatting, alt: "Writing & Formatting" })}
                      aria-label="Open writing and formatting screenshot fullscreen"
                    >
                      <img
                        src={writingFormatting}
                        alt="Writing & Formatting"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "opinions" ? (
                    <AutoplayVideo src={aiEditorVideo.url} ariaLabel="AI Editor reviewing a selected passage" />
                  ) : s.id === "asking" ? (
                    <AutoplayVideo src={chatVideo.url} ariaLabel="Chatting with your manuscript" />
                  ) : s.id === "feedback-examples" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: aiEditorShot, alt: "AI Editor feedback examples" })}
                      aria-label="Open AI Editor feedback examples fullscreen"
                    >
                      <img
                        src={aiEditorShot}
                        alt="AI Editor feedback examples"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "selection" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: chatSelectionShot, alt: "Chat with Your Manuscript grounded on a selected passage" })}
                      aria-label="Open Chat selection screenshot fullscreen"
                    >
                      <img
                        src={chatSelectionShot}
                        alt="Chat with Your Manuscript grounded on a selected passage"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "byok" && activeTopic === "plans-credits" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30 bg-black/40"
                      onClick={() => setFullscreenImage({ src: byokKeyShot, alt: "Bring Your Own OpenAI Key settings" })}
                      aria-label="Open BYOK settings screenshot fullscreen"
                    >
                      <img
                        src={byokKeyShot}
                        alt="Bring Your Own OpenAI Key settings"
                        className="w-full h-auto object-contain max-h-[320px] mx-auto"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "dates" ? (
                    <AutoplayVideo src={timelineDatesVideo.url} ariaLabel="Timeline dates and ranges" />
                  ) : s.id === "pan-zoom" ? (
                    <AutoplayVideo src={timelineZoomVideo.url} ariaLabel="Panning and zooming the timeline" />
                  ) : s.id === "previews" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: timelinePreviewShot, alt: "Timeline event preview" })}
                      aria-label="Open timeline event preview screenshot fullscreen"
                    >
                      <img
                        src={timelinePreviewShot}
                        alt="Timeline event preview"
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                    </button>
                  ) : s.id === "pointer" ? (
                    <AutoplayVideo src={mapPointerVideo.url} ariaLabel="Selecting and moving pills with the pointer tool" />
                  ) : s.id === "pan" ? (
                    <AutoplayVideo src={mapPanVideo.url} ariaLabel="Panning and zooming the map" />
                  ) : s.id === "pencil" ? (
                    <AutoplayVideo src={mapPencilVideo.url} ariaLabel="Drawing with the pencil and color picker" />
                  ) : s.id === "fill" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: mapFillShot, alt: "Fill bucket tool on the map" })}
                      aria-label="Open fill bucket screenshot fullscreen"
                    >
                      <img src={mapFillShot} alt="Fill bucket tool on the map" className="w-full h-auto object-cover" loading="lazy" />
                    </button>
                  ) : s.id === "eyedropper" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: mapEyedropperShot, alt: "Eyedropper color picker on the map" })}
                      aria-label="Open eyedropper screenshot fullscreen"
                    >
                      <img src={mapEyedropperShot} alt="Eyedropper color picker on the map" className="w-full h-auto object-cover" loading="lazy" />
                    </button>
                  ) : s.id === "brush" ? (
                    <button
                      className="block w-full my-4 rounded-lg overflow-hidden border border-white/10 transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#f3ead6]/30"
                      onClick={() => setFullscreenImage({ src: mapBrushShot, alt: "Brush size picker on the map" })}
                      aria-label="Open brush size screenshot fullscreen"
                    >
                      <img src={mapBrushShot} alt="Brush size picker on the map" className="w-full h-auto object-cover" loading="lazy" />
                    </button>
                  ) : s.id === "label" ? (
                    <AutoplayVideo src={mapLabelsVideo.url} ariaLabel="Placing a label pill on the map" />
                  ) : s.id === "notebook-pill" ? (
                    <AutoplayVideo src={mapNoteVideo.url} ariaLabel="Placing a notebook pill on the map" />
                  ) : s.id === "stickers" ? (
                    <AutoplayVideo src={aiDrawVideo.url} ariaLabel="Generating an AI sticker on the map" />
                  ) : s.media === undefined ? null : (
                    <MediaPlaceholder kind={s.media ?? "image"} />
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>

      {fullscreenImage && (
        <FullscreenImage
          src={fullscreenImage.src}
          alt={fullscreenImage.alt}
          onClose={() => setFullscreenImage(null)}
        />
      )}
    </div>
  );
}