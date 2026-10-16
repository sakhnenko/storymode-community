import { useEffect, useRef, useState, type ComponentType } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Brain, CalendarBlank, Check, ClockCounterClockwise, Eye, Folders, ImageSquare, MagicWand, Palette, PencilSimple,
  Scroll, User, type IconProps,
} from "@/components/ui/icons";
import { useLiquidGlass, type GlassParams } from "@/components/ui/liquid-glass";

type IconType = ComponentType<IconProps>;

/** The four big features, each with its demo video and an icon per sub-feature. */
const FEATURES: { key: string; video: string; icons: IconType[] }[] = [
  { key: "write", video: "write", icons: [Eye, Brain, Check] },
  { key: "folios", video: "folios", icons: [Folders, Palette, CalendarBlank] },
  { key: "maps", video: "map", icons: [MagicWand, ImageSquare, PencilSimple] },
  { key: "codex", video: "codex", icons: [User, Scroll, ClockCounterClockwise] },
];

const VIDEO_DIR = "/home/features";
const SERIF = "'Newsreader', serif";
/** The face of the header menu, for the sub-feature lists. */
const MONO = "'JetBrains Mono', monospace";

/** Light paper palette for these sections. */
const PAPER = "#f6f3ec";
const INK = "#1d1a14";
const MUTED = "#6b6457";
const RULE = "rgba(29,26,20,.1)";

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Plays a video while it's on screen, unless the reader prefers reduced motion. */
function useAutoplayInView(ref: React.RefObject<HTMLVideoElement>, enabled: boolean) {
  useEffect(() => {
    const video = ref.current;
    if (!video || !enabled) return;
    let visible = false;
    // Browsers refuse to start a video in a background tab: try again once it's shown.
    const play = () => { if (visible && !document.hidden) void video.play().catch(() => {}); };
    const observer = new IntersectionObserver(([entry]) => {
      const entering = entry.isIntersecting && !visible;
      visible = entry.isIntersecting;
      if (!visible) { video.pause(); return; }
      // Each time a feature scrolls into view, its demo starts from the top.
      if (entering) video.currentTime = 0;
      play();
    }, { threshold: 0.35 });
    observer.observe(video);
    document.addEventListener("visibilitychange", play);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", play);
    };
  }, [ref, enabled]);
}

/**
 * The demo seen through a pane of glass: no frost, so the picture stays sharp,
 * but a thick rim that bends the edges of the video under a lit rim (Chromium;
 * elsewhere just the frame). No rainbow edge: over the app's bright UI it
 * fringes text and turns the lit corner magenta.
 */
const PANE_GLASS: Partial<GlassParams> = {
  blur: 0, saturate: 1.1, lum: 1, contrast: 1,
  // A rim no wider than the frame's 9px corners, so the bent edge turns the
  // corner on the same curve as the frame (a wider rim bends on a wider arc).
  bezel: 0.045, maxBezel: 10, depth: 1.8, dispersion: 0, zoom: 1, rim: 0.6,
};

/**
 * A feature's demo video under glass. While it crosses the screen it turns in
 * 3D: leaning back as it rises into view, facing the reader in the middle of
 * the screen, and tipping away as it scrolls off the top.
 */
function FeatureVideo({ videoRef, name, label, side, still }: { videoRef: React.RefObject<HTMLVideoElement>; name: string; label: string; side: "left" | "right"; still: boolean }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const glass = useLiquidGlass<HTMLDivElement>(PANE_GLASS);
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["start end", "end start"] });
  // Flat through the middle stretch, so it holds still while it's being watched.
  const stops = [0, 0.4, 0.6, 1];
  const rotateX = useTransform(scrollYProgress, stops, [38, 0, 0, -28]);
  // It also swings in from its outer edge, opening toward the text beside it.
  const swing = side === "right" ? 1 : -1;
  const rotateY = useTransform(scrollYProgress, stops, [18 * swing, 0, 0, -10 * swing]);
  const scale = useTransform(scrollYProgress, stops, [0.82, 1, 1, 0.9]);
  const y = useTransform(scrollYProgress, stops, [90, 0, 0, -50]);

  return (
    <div style={{ perspective: 1200 }}>
      <motion.div
        ref={frameRef}
        className="relative overflow-hidden rounded-[9px] shadow-[0_30px_80px_-30px_rgba(29,26,20,.35)]"
        style={{ aspectRatio: "1328 / 1080", background: "#e9e4d8", ...(still ? {} : { rotateX, rotateY, scale, y, transformOrigin: "50% 50%" }) }}
      >
        <video
          ref={videoRef}
          src={`${VIDEO_DIR}/${name}.mp4`}
          poster={`${VIDEO_DIR}/${name}.jpg`}
          aria-label={label}
          muted
          loop
          playsInline
          preload="metadata"
          controls={still}
          className="h-full w-full object-cover"
        />
        {/* The pane: bends the video's edges and lights its rim */}
        <div ref={glass} aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[9px] border border-white/40" />
      </motion.div>
    </div>
  );
}

function FeatureBlock({ index, featureKey, video, icons, still }: { index: number; featureKey: string; video: string; icons: IconType[]; still: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLVideoElement>(null);
  useAutoplayInView(ref, !still);
  const items = t(`home.showcase.${featureKey}.items`, { returnObjects: true }) as { title: string; body: string }[];
  // Media alternates sides, like a magazine spread.
  const mediaFirst = index % 2 === 1;

  return (
    <section className={`${index > 0 ? "border-t " : ""}px-6 py-20 md:px-[6vw] md:py-28`} style={{ borderColor: RULE }}>
      <div className={`mx-auto grid max-w-[1480px] items-center gap-12 lg:gap-[5vw] ${mediaFirst ? "lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]" : "lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]"}`}>
        <div className={mediaFirst ? "lg:order-2" : "lg:order-1"}>
          <h2 className="m-0 text-[clamp(32px,3.4vw,46px)] font-medium leading-[1.08] tracking-[-0.8px]" style={{ fontFamily: SERIF, color: INK }}>
            {t(`home.showcase.${featureKey}.title`)}
          </h2>
          <ul className="m-0 mt-10 list-none p-0">
            {items.map((item, i) => {
              const Icon = icons[i];
              return (
                <li key={item.title} className="flex gap-4 border-t py-5" style={{ borderColor: RULE }}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border bg-white" style={{ borderColor: RULE, color: INK }}>
                    {Icon && <Icon weight="duotone" className="h-[18px] w-[18px]" />}
                  </span>
                  <div>
                    <div className="text-[14px] font-medium leading-snug" style={{ fontFamily: MONO, color: INK }}>{item.title}</div>
                    <div className="mt-1.5 text-[13px] leading-[1.6]" style={{ fontFamily: MONO, color: MUTED }}>{item.body}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* On phones every section opens with its video */}
        {/* Pulled out toward the page edge on wide screens */}
        <div className={`order-first ${mediaFirst ? "lg:order-1 lg:-ml-[3vw]" : "lg:order-2 lg:-mr-[3vw]"}`}>
          <FeatureVideo videoRef={ref} name={video} label={t(`home.showcase.${featureKey}.title`)} side={mediaFirst ? "left" : "right"} still={still} />
        </div>
      </div>
    </section>
  );
}

/**
 * Home page variation, after taito.ai: below the hero, a light page where each
 * of the four big features gets its own section, with a large demo video that
 * plays as it scrolls into view and a ruled list of what it can do.
 */
export function FeatureShowcase() {
  const [still] = useState(prefersReducedMotion);

  return (
    <div className="sm-showcase" style={{ background: PAPER, color: INK }}>
      {FEATURES.map((feature, i) => (
        <FeatureBlock key={feature.key} index={i} featureKey={feature.key} video={feature.video} icons={feature.icons} still={still} />
      ))}
    </div>
  );
}

export default FeatureShowcase;
