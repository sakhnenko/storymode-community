import { Seo } from "@/components/seo/Seo";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Globe, Check } from "@/components/ui/icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES, setLanguage, type LanguageCode } from "@/i18n";
import { OverviewVideo } from "@/components/home/OverviewVideo";
import { FeatureShowcase } from "@/components/home/FeatureShowcase";
import { HOME_SHOWCASE_FLAG, usePublicFeature } from "@/hooks/useFeatureAccess";
import "@/styles/storymode.css";

/* ============================================================
   Theme palettes — randomly picked per load.
   ============================================================ */
type Theme = {
  img: string; objPos: string;
  fade: string; vfade: string;
  ink: string; sub: string; eye: string; nav: string;
  pillBg: string; pillTx: string;
  credit: string; ghostB: string; ghostTx: string;
  ghostBg: string; ghostBgHover: string; ghostBHover: string;
  creditText: string;
};

const THEMES: Theme[] = [
  { img: "/assets/seurat-web.jpg", objPos: "center 42%",
    fade: "linear-gradient(90deg,rgba(13,10,7,.86) 0%,rgba(13,10,7,.55) 30%,rgba(13,10,7,.16) 55%,rgba(13,10,7,0) 78%)",
    vfade: "linear-gradient(180deg,rgba(13,10,7,.55) 0%,rgba(13,10,7,0) 18%,rgba(13,10,7,0) 76%,rgba(22,19,14,.92) 100%)",
    ink: "#f4ecd9", sub: "#ded3bd", eye: "#f2c53d", nav: "rgba(243,234,214,.86)",
    pillBg: "#f3ead6", pillTx: "#14110c",
    credit: "rgba(243,234,214,.6)", ghostB: "rgba(243,234,214,.35)", ghostTx: "#f3ead6",
    ghostBg: "rgba(14,12,8,.32)", ghostBgHover: "rgba(14,12,8,.48)", ghostBHover: "rgba(243,234,214,.5)",
    creditText: "Georges Seurat · Circus Sideshow · 1887–88" },
  { img: "/assets/turner-web.jpg", objPos: "center 56%",
    fade: "linear-gradient(90deg,rgba(238,233,221,.9) 0%,rgba(238,233,221,.55) 30%,rgba(238,233,221,.16) 56%,rgba(238,233,221,0) 78%)",
    vfade: "linear-gradient(180deg,rgba(243,239,229,.72) 0%,rgba(243,239,229,0) 20%,rgba(243,239,229,0) 64%,rgba(40,35,26,.62) 100%)",
    ink: "#211d16", sub: "#3a3428", eye: "#9a3b2e", nav: "rgba(26,22,15,.92)",
    pillBg: "#1f1b14", pillTx: "#fbf7ec",
    credit: "rgba(247,243,233,.82)", ghostB: "rgba(33,29,22,.35)", ghostTx: "#211d16",
    ghostBg: "rgba(243,234,214,.32)", ghostBgHover: "rgba(243,234,214,.48)", ghostBHover: "rgba(33,29,22,.5)",
    creditText: "J.M.W. Turner · The Whale Ship · c. 1845" },
  { img: "/assets/keelmen-web.jpg", objPos: "center 46%",
    fade: "linear-gradient(90deg,rgba(226,232,238,.92) 0%,rgba(226,232,238,.58) 30%,rgba(226,232,238,.16) 56%,rgba(226,232,238,0) 78%)",
    vfade: "linear-gradient(180deg,rgba(231,237,242,.74) 0%,rgba(231,237,242,0) 20%,rgba(231,237,242,0) 62%,rgba(20,24,30,.72) 100%)",
    ink: "#1a1e24", sub: "#2e343c", eye: "#9a3b2e", nav: "rgba(22,26,32,.92)",
    pillBg: "#1a1e24", pillTx: "#eef3f7",
    credit: "rgba(238,243,247,.82)", ghostB: "rgba(26,30,38,.35)", ghostTx: "#1a1e24",
    ghostBg: "rgba(238,243,247,.32)", ghostBgHover: "rgba(238,243,247,.48)", ghostBHover: "rgba(26,30,38,.5)",
    creditText: "J.M.W. Turner · Keelmen Heaving in Coals by Moonlight · 1835" },
  { img: "/assets/meadow-web.jpg", objPos: "center 50%",
    fade: "linear-gradient(90deg,rgba(232,237,228,.92) 0%,rgba(232,237,228,.58) 30%,rgba(232,237,228,.16) 56%,rgba(232,237,228,0) 78%)",
    vfade: "linear-gradient(180deg,rgba(236,240,231,.7) 0%,rgba(236,240,231,0) 20%,rgba(236,240,231,0) 60%,rgba(233,237,226,.82) 100%)",
    ink: "#1e2a22", sub: "#33433a", eye: "#9a3b2e", nav: "rgba(22,32,26,.92)",
    pillBg: "#1e2a22", pillTx: "#eef3ec",
    credit: "rgba(30,42,34,.72)", ghostB: "rgba(30,42,34,.35)", ghostTx: "#1e2a22",
    ghostBg: "rgba(236,240,231,.32)", ghostBgHover: "rgba(236,240,231,.48)", ghostBHover: "rgba(30,42,34,.5)",
    creditText: "Alfred Sisley · The Meadow · 1875" },
  { img: "/assets/seine-web.jpg", objPos: "center 52%",
    fade: "linear-gradient(90deg,rgba(245,232,224,.93) 0%,rgba(245,232,224,.6) 30%,rgba(245,232,224,.18) 56%,rgba(245,232,224,0) 78%)",
    vfade: "linear-gradient(180deg,rgba(247,236,229,.72) 0%,rgba(247,236,229,0) 20%,rgba(247,236,229,0) 60%,rgba(244,228,219,.82) 100%)",
    ink: "#2c1e1f", sub: "#473034", eye: "#9a3b2e", nav: "rgba(44,30,31,.92)",
    pillBg: "#2c1e1f", pillTx: "#f7ece8",
    credit: "rgba(58,38,38,.74)", ghostB: "rgba(44,30,31,.35)", ghostTx: "#2c1e1f",
    ghostBg: "rgba(247,236,229,.32)", ghostBgHover: "rgba(247,236,229,.48)", ghostBHover: "rgba(44,30,31,.5)",
    creditText: "The Seine at Sunset · 1902" },
  { img: "/assets/baileys-web.jpg", objPos: "center 44%",
    fade: "linear-gradient(90deg,rgba(236,238,226,.93) 0%,rgba(236,238,226,.6) 30%,rgba(236,238,226,.18) 56%,rgba(236,238,226,0) 78%)",
    vfade: "linear-gradient(180deg,rgba(238,240,229,.72) 0%,rgba(238,240,229,0) 20%,rgba(238,240,229,0) 60%,rgba(18,30,34,.72) 100%)",
    ink: "#1d2620", sub: "#33433a", eye: "#9a3b2e", nav: "rgba(20,30,24,.92)",
    pillBg: "#1d2620", pillTx: "#eef3ec",
    credit: "rgba(236,243,240,.82)", ghostB: "rgba(29,38,32,.35)", ghostTx: "#1d2620",
    ghostBg: "rgba(238,240,229,.32)", ghostBgHover: "rgba(238,240,229,.48)", ghostBHover: "rgba(29,38,32,.5)",
    creditText: "Childe Hassam · Bailey’s Beach, Newport, R.I. · 1895" },
  { img: "/assets/marne-web.jpg", objPos: "center 38%",
    fade: "linear-gradient(90deg,rgba(228,230,228,.94) 0%,rgba(228,230,228,.62) 30%,rgba(228,230,228,.2) 56%,rgba(228,230,228,0) 78%)",
    vfade: "linear-gradient(180deg,rgba(230,231,230,.74) 0%,rgba(230,231,230,0) 22%,rgba(230,231,230,0) 60%,rgba(226,228,224,.8) 100%)",
    ink: "#20262a", sub: "#39424a", eye: "#9a3b2e", nav: "rgba(26,32,36,.92)",
    pillBg: "#20262a", pillTx: "#eef2f4",
    credit: "rgba(40,46,50,.74)", ghostB: "rgba(32,38,42,.35)", ghostTx: "#20262a",
    ghostBg: "rgba(230,231,230,.32)", ghostBgHover: "rgba(230,231,230,.48)", ghostBHover: "rgba(32,38,42,.5)",
    creditText: "Camille Pissarro · The Banks of the Marne in Winter · 1866" },
];

type SectionData = {
  num: string; kicker: string; hinge: "left" | "right"; bg: string;
  title: string; body: string; items: string[];
  images: { src: string; alt: string }[];
};

// Feature demo videos live in the public `homepage-videos` storage bucket.
const VIDEO_BASE = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/homepage-videos`;
const v = (name: string) => `${VIDEO_BASE}/${name}`;

const SECTION_IMAGES = {
  write: [
    { src: v("Focusmode-2.mp4"), alt: "Focus mode" },
    { src: v("Folios.mp4"), alt: "Folios in the margin" },
    { src: v("Editor.mp4"), alt: "AI editor" },
    { src: v("Chat.mp4"), alt: "Book-wide chat" },
  ],
  organize: [
    { src: v("folios-browse.mp4"), alt: "Organize into folios" },
    { src: v("folios-notebooks.mp4"), alt: "Arrange & style notebooks" },
    { src: v("folios-timelines.mp4"), alt: "Every date on a timeline" },
  ],
  map: [
    { src: v("maps-annotate.mp4"), alt: "Create & annotate maps" },
    { src: v("maps-draw.mp4"), alt: "Draw & sketch by hand" },
    { src: v("maps-ai.mp4"), alt: "Bring locations to life with AI" },
  ],
} as const;

function FeatureSection({ data }: { data: SectionData }) {
  const rev = data.hinge === "left";
  return (
    <section
      className="sm-section"
      data-hinge={rev ? "left" : undefined}
      data-screen-label={data.kicker}
      style={{ background: data.bg }}
    >
      <div className="sm-sticky">
        <div className={"sm-watermark " + (rev ? "sm-watermark--left" : "sm-watermark--right")}>
          {data.num}
        </div>

        <div className="sm-top">
          <div className="sm-textcol">
            <div className="sm-kicker-row">
              <span className="sm-kicker-num">{data.num}</span>
              <span className="sm-kicker-rule" />
              <span className="sm-kicker-label">{data.kicker}</span>
            </div>
            <h2 className="sm-h2">{data.title}</h2>
            <p className="sm-body">{data.body}</p>
          </div>
          <ul className="sm-idxlist">
            {data.items.map((label, i) => (
              <li className="sm-idx" data-idx={i} key={label}>
                <span className="sm-idx-num">{String(i + 1).padStart(2, "0")}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="sm-stage">
          <div className="sm-stage-shadow" />
          {data.images.map((img, i) => (
            <div className="sm-page" style={{ zIndex: data.images.length - i }} key={img.src}>
              <div className="sm-page-front">
                <video
                  className="sm-page-img sm-page-video"
                  data-video-index={i}
                  src={img.src}
                  aria-label={img.alt}
                  muted
                  playsInline
                  preload={i === 0 ? "auto" : "metadata"}
                />
                <div className="sm-shade" />
              </div>
              <div className="sm-page-back"><span>StoryMode</span></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

type HomeVariant = "sections" | "showcase";

/**
 * The public home page. The "showcase" variant swaps the intro video and the
 * three feature sections for a light page with a section per big feature. At
 * / the home_showcase flag picks the variant; /home-1 and /home-2 pin one each.
 */
export default function HomePage({ variant: pinned }: { variant?: HomeVariant }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const showcaseOn = usePublicFeature(HOME_SHOWCASE_FLAG);
  // Below the hero waits for the flag (the hero fills the first screen), so
  // the wrong variant never flashes in.
  const variant: HomeVariant | null = pinned ?? (showcaseOn === undefined ? null : showcaseOn ? "showcase" : "sections");
  const theme = useMemo(() => THEMES[Math.floor(Math.random() * THEMES.length)], []);

  const currentLang = (i18n.language || "en").startsWith("pt") ? "pt-BR" : "en";

  const SECTIONS: SectionData[] = useMemo(() => {
    const make = (key: "write" | "organize" | "map", num: string, hinge: "left" | "right", bg: string): SectionData => ({
      num,
      hinge,
      bg,
      kicker: t(`home.sections.${key}.kicker`),
      title: t(`home.sections.${key}.title`),
      body: t(`home.sections.${key}.body`),
      items: t(`home.sections.${key}.items`, { returnObjects: true }) as string[],
      images: SECTION_IMAGES[key].map((img, i) => ({
        src: img.src,
        alt: (t(`home.sections.${key}.items`, { returnObjects: true }) as string[])[i] ?? img.alt,
      })),
    });
    return [
      make("write", "01", "right", "#16130e"),
      make("organize", "02", "left", "#191510"),
      make("map", "03", "right", "#16130e"),
    ];
  }, [t]);

  const goSignup = () => {
    if (user) { navigate("/dashboard"); return; }
    navigate("/waitlist");
  };
  const goLogin = () => navigate(user ? "/dashboard" : "/auth?mode=login");


  const rootVars = {
    "--fade": theme.fade,
    "--vfade": theme.vfade,
    "--ink": theme.ink,
    "--sub": theme.sub,
    "--eye": theme.eye,
    "--nav": theme.nav,
    "--pill-bg": theme.pillBg,
    "--pill-tx": theme.pillTx,
    "--credit": theme.credit,
    "--ghost-b": theme.ghostB,
    "--ghost-tx": theme.ghostTx,
    "--ghost-bg": theme.ghostBg,
    "--ghost-bg-hover": theme.ghostBgHover,
    "--ghost-b-hover": theme.ghostBHover,
  } as React.CSSProperties;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const nav = root.querySelector(".sm-nav") as HTMLElement | null;

    let navState = -1;
    const setNav = (scrolled: number) => {
      if (scrolled === navState) return;
      navState = scrolled;
      nav?.classList.toggle("sm-nav--scrolled", scrolled === 1);
    };

    const sections = Array.from(root.querySelectorAll<HTMLElement>(".sm-section")).map((sec) => {
      const dir = sec.dataset.hinge === "left" ? -1 : 1;
      const pages = Array.from(sec.querySelectorAll<HTMLElement>(".sm-page"));
      pages.forEach((pg) => { pg.style.transformOrigin = dir === 1 ? "right center" : "left center"; });
      const videos = pages.map((pg) => pg.querySelector<HTMLVideoElement>(".sm-page-video"));
      return {
        el: sec,
        pages,
        idx: Array.from(sec.querySelectorAll<HTMLElement>(".sm-idx")),
        videos,
        dir,
        lastActive: -1,
        inView: false,
      };
    });
    const smooth = (x: number) => x * x * (3 - 2 * x);
    const ACTIVE = "#f2c53d";
    const DIM = "rgba(240,231,210,.42)";

    const update = () => {
      const vh = window.innerHeight;
      const sy = window.scrollY;
      setNav(sy > vh * 0.72 ? 1 : 0);
      for (const s of sections) {
        const n = s.pages.length;
        const top = s.el.offsetTop;
        const total = s.el.offsetHeight - vh;
        let p = total > 0 ? (sy - top) / total : 0;
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        const af = p * (n - 1);
        for (let i = 0; i < n; i++) {
          const pg = s.pages[i];
          let flip = af - i;
          flip = flip < 0 ? 0 : flip > 1 ? 1 : flip;
          const fe = smooth(flip);
          pg.style.transform = "rotateY(" + (s.dir * fe * 180) + "deg)";
          pg.style.zIndex = String(flip <= 0 ? (n - i) : flip >= 1 ? (n + i) : (3 * n));
          const front = pg.children[0] as HTMLElement | undefined;
          const back = pg.children[1] as HTMLElement | undefined;
          const showFront = fe < 0.5;
          if (front) front.style.opacity = showFront ? "1" : "0";
          if (back) back.style.opacity = showFront ? "0" : "1";
          const sh = pg.querySelector<HTMLElement>(".sm-shade");
          if (sh) sh.style.opacity = String(Math.sin(fe * Math.PI) * 0.55);
        }
        const active = Math.round(af);
        for (let i = 0; i < s.idx.length; i++) {
          s.idx[i].style.color = i === active ? ACTIVE : DIM;
        }
        if (s.inView && (active !== s.lastActive)) {
          s.lastActive = active;
          s.videos.forEach((vd, i) => {
            if (!vd) return;
            if (i === active) {
              try { vd.currentTime = 0; } catch { /* video not ready to seek yet */ }
              vd.play().catch(() => {});
            } else {
              vd.pause();
            }
          });
        }
      }
    };

    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => { update(); ticking = false; });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("load", update);
    update();
    const settle = setTimeout(update, 300);

    // Only play videos while the section is on screen — save bandwidth + CPU.
    const visIo = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const s = sections.find((sec) => sec.el === e.target);
        if (!s) return;
        s.inView = e.isIntersecting;
        if (!s.inView) {
          s.videos.forEach((vd) => vd?.pause());
          s.lastActive = -1;
        } else {
          // kick the currently-active video
          const active = Math.max(0, s.lastActive);
          const vd = s.videos[active];
          if (vd) vd.play().catch(() => {});
        }
      });
    }, { threshold: 0.15 });
    sections.forEach((s) => visIo.observe(s.el));

    // ---- Auto-advance the page-flip when the active video finishes ----
    let autoScrollRaf = 0;
    const smoothScrollTo = (targetY: number, duration = 900) => {
      cancelAnimationFrame(autoScrollRaf);
      const startY = window.scrollY;
      const dist = targetY - startY;
      if (Math.abs(dist) < 2) return;
      const t0 = performance.now();
      const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        window.scrollTo(0, startY + dist * ease(p));
        if (p < 1) autoScrollRaf = requestAnimationFrame(step);
      };
      autoScrollRaf = requestAnimationFrame(step);
    };
    const advanceFrom = (s: typeof sections[number], fromIdx: number) => {
      const n = s.pages.length;
      const vh = window.innerHeight;
      const total = s.el.offsetHeight - vh;
      if (fromIdx < n - 1) {
        // scroll so page index (fromIdx + 1) is fully facing
        const nextP = (fromIdx + 1) / (n - 1);
        smoothScrollTo(s.el.offsetTop + nextP * total);
      } else {
        // Move to the next section's first page.
        const i = sections.indexOf(s);
        const nextSec = sections[i + 1];
        if (nextSec) smoothScrollTo(nextSec.el.offsetTop + 4);
      }
    };
    const endedCleanups: Array<() => void> = [];
    sections.forEach((s) => {
      s.videos.forEach((vd, i) => {
        if (!vd) return;
        const onEnded = () => {
          if (!s.inView) return;
          if (i !== s.lastActive) return;
          advanceFrom(s, i);
        };
        vd.addEventListener("ended", onEnded);
        endedCleanups.push(() => vd.removeEventListener("ended", onEnded));
      });
    });

    const seeBtn = root.querySelector(".sm-see-how");
    // The first feature section, or the showcase that replaces them.
    const firstSection = root.querySelector<HTMLElement>(".sm-section, .sm-showcase");
    const onSee = () => {
      if (!firstSection) return;
      const target = firstSection.offsetTop + 4;
      const start = window.scrollY;
      const dist = target - start;
      const dur = Math.min(1100, Math.max(450, Math.abs(dist) * 0.5));
      let t0: number | null = null;
      const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      const stepFn = (ts: number) => {
        if (t0 === null) t0 = ts;
        const pr = Math.min(1, (ts - t0) / dur);
        window.scrollTo(0, start + dist * ease(pr));
        if (pr < 1) requestAnimationFrame(stepFn);
      };
      requestAnimationFrame(stepFn);
    };
    if (seeBtn && firstSection) seeBtn.addEventListener("click", onSee);

    // Lightbox
    const lb = document.createElement("div");
    lb.style.cssText = "position:fixed;inset:0;z-index:1000;background:rgba(11,9,6,.93);display:none;align-items:center;justify-content:center;padding:6vh 6vw;opacity:0;transition:opacity .28s ease;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);";
    const fig = document.createElement("img");
    fig.style.cssText = "max-width:100%;max-height:100%;border-radius:6px;box-shadow:0 40px 110px rgba(0,0,0,.7),0 0 0 1px rgba(240,231,210,.12);transition:opacity .18s ease;cursor:default;";
    lb.appendChild(fig);
    const arrowCss = "position:absolute;top:50%;transform:translateY(-50%);width:56px;height:56px;border-radius:999px;border:1px solid rgba(243,234,214,.3);background:rgba(20,17,12,.5);color:#f3ead6;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;font-family:'JetBrains Mono',monospace;transition:background .2s,border-color .2s;user-select:none;";
    const prev = document.createElement("div"); prev.textContent = "‹"; prev.style.cssText = arrowCss + "left:max(18px,2.5vw);";
    const next = document.createElement("div"); next.textContent = "›"; next.style.cssText = arrowCss + "right:max(18px,2.5vw);";
    const hoverIn = (a: HTMLElement) => { a.style.background = "rgba(242,197,61,.92)"; a.style.borderColor = "transparent"; a.style.color = "#16130e"; };
    const hoverOut = (a: HTMLElement) => { a.style.background = "rgba(20,17,12,.5)"; a.style.borderColor = "rgba(243,234,214,.3)"; a.style.color = "#f3ead6"; };
    [prev, next].forEach((a) => {
      a.addEventListener("mouseenter", () => hoverIn(a));
      a.addEventListener("mouseleave", () => hoverOut(a));
    });
    lb.appendChild(prev); lb.appendChild(next);
    const caption = document.createElement("div");
    caption.style.cssText = "position:absolute;bottom:30px;left:0;right:0;text-align:center;font-family:'JetBrains Mono',monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:rgba(243,234,214,.82);pointer-events:none;";
    lb.appendChild(caption);
    const counter = document.createElement("div");
    counter.style.cssText = "position:absolute;top:28px;left:0;right:0;text-align:center;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.22em;color:rgba(243,234,214,.45);pointer-events:none;";
    lb.appendChild(counter);
    const close = document.createElement("div");
    close.textContent = "✕"; close.title = "Close (Esc)";
    close.style.cssText = "position:absolute;top:22px;right:max(18px,2.5vw);width:40px;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:15px;color:rgba(243,234,214,.75);cursor:pointer;font-family:'JetBrains Mono',monospace;transition:color .2s;";
    close.addEventListener("mouseenter", () => (close.style.color = "#f3ead6"));
    close.addEventListener("mouseleave", () => (close.style.color = "rgba(243,234,214,.75)"));
    lb.appendChild(close);
    document.body.appendChild(lb);

    const lbList: HTMLImageElement[] = [];
    let lbIndex = 0;
    const closeLb = () => { lb.style.opacity = "0"; setTimeout(() => { lb.style.display = "none"; }, 280); };
    const showAt = (i: number) => {
      const n = lbList.length;
      if (!n) return;
      lbIndex = (i + n) % n;
      const img = lbList[lbIndex];
      fig.style.opacity = "0";
      setTimeout(() => {
        fig.src = img.currentSrc || img.src;
        fig.alt = img.alt || "";
        caption.textContent = img.alt || "";
        counter.textContent = (lbIndex + 1) + " / " + n;
        fig.style.opacity = "1";
      }, 120);
      prev.style.display = next.style.display = n > 1 ? "flex" : "none";
    };
    const step = (d: number) => showAt(lbIndex + d);
    lb.addEventListener("click", closeLb);
    [fig, prev, next, close, caption, counter].forEach((el) => el.addEventListener("click", (e) => e.stopPropagation()));
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));
    close.addEventListener("click", closeLb);
    const onKey = (e: KeyboardEvent) => {
      if (lb.style.display !== "flex") return;
      if (e.key === "Escape") closeLb();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);

    // Lightbox is retained for future image use, but the feature stages are now
    // videos and don't open a zoom on click.
    const stageCleanups: Array<() => void> = [];

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      window.removeEventListener("load", update);
      document.removeEventListener("keydown", onKey);
      clearTimeout(settle);
      if (seeBtn) seeBtn.removeEventListener("click", onSee);
      stageCleanups.forEach((fn) => fn());
      endedCleanups.forEach((fn) => fn());
      cancelAnimationFrame(autoScrollRaf);
      visIo.disconnect();
      lb.remove();
    };
  // Runs again once the variant is known: it wires up whichever sections rendered.
  }, [variant]);

  const ctaLabel = user ? t("home.nav.myProjects") : t("home.nav.joinWaitlist");
  const navPillLabel = user ? t("home.nav.myProjects") : t("home.nav.waitlistShort");

  return (
    <div className="sm-root" ref={rootRef} style={rootVars}>
      <Seo
        title="StoryMode — Write Stories. Create Worlds."
        description="Plan novels, scripts and campaigns in one calm workspace: chapter drafts, AI writing feedback, interactive timelines and fun story maps."
        path={pinned === "showcase" ? "/home-2" : pinned === "sections" ? "/home-1" : "/"}
        noindex={!!pinned}
      />
      <nav className="sm-nav">
        <div className="sm-nav-left">
          <span className="sm-navmark"><img src="/logo.png" alt="StoryMode logo" className="sm-navmark-logo" /><span>Story<em>mode</em></span></span>
        </div>
        <div className="sm-nav-right">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="sm-lang-trigger">
                <Globe weight="duotone" className="sm-lang-icon" />
                <span>{currentLang === "pt-BR" ? "PT" : "EN"}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} collisionPadding={16} className="sm-lang-dropdown">
              <div className="sm-lang-label-header">{t("common.language")}</div>
              {SUPPORTED_LANGUAGES.map((l) => {
                const isCurrent = currentLang === l.code;
                return (
                  <DropdownMenuItem
                    key={l.code}
                    className={`sm-lang-item ${isCurrent ? "sm-lang-item--active" : ""}`}
                    onClick={() => setLanguage(l.code as LanguageCode)}
                  >
                    <span>{l.label}</span>
                    {isCurrent && <Check weight="bold" className="w-3 h-3" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="sm-nav-link" onClick={() => navigate("/plans")}>{t("home.nav.plans")}</span>
          <span className="sm-nav-link" onClick={() => navigate("/guide")}>{t("home.nav.guide")}</span>
          {!user && <span className="sm-nav-link" onClick={goLogin}>{t("home.nav.login")}</span>}
          <span className="sm-pill" onClick={goSignup}>{navPillLabel}</span>
        </div>
      </nav>

      <header className="sm-hero" data-screen-label="Hero">
        <img className="sm-hero-img" src={theme.img} alt="" style={{ objectPosition: theme.objPos }} />
        <div className="sm-fade" />
        <div className="sm-vfade" />

        <div className="sm-hero-content">
          <div className="sm-eyebrow">{t("home.hero.eyebrow")}</div>
          <h1 className="sm-h1">
            Story<i>mode</i>
            <span className="sr-only"> — {t("home.hero.title")}</span>
          </h1>
          <div className="sm-sub">{t("home.hero.sub")}</div>
          <div className="sm-cta-row">
            <span className="sm-cta-primary" onClick={goSignup}>{ctaLabel}</span>
            <span className="sm-cta-ghost sm-see-how">{t("home.hero.seeHow")}</span>
          </div>
        </div>

        <div className="sm-credit sm-credit--right">{theme.creditText}</div>
        <div className="sm-credit sm-credit--left">
          {t("home.hero.scroll")} <span style={{ fontSize: 14 }}>↓</span>
        </div>
      </header>

      {variant === "sections" && <section className="sm-intro">
        <div className="sm-intro-kicker">{t("home.intro.kicker")}</div>
        <h2 className="sm-intro-h2">
          <div><span style={{ fontSize: "55.9px" }}>{t("home.intro.build")}&nbsp;</span></div>
          <span style={{ color: "#f2c53d", fontSize: "55.9px" }}><i>{t("home.intro.plan")}</i></span>
          &nbsp;{t("home.intro.tell")}
        </h2>
        <OverviewVideo />
        <span className="sm-intro-guide" onClick={() => navigate("/guide")}>
          {t("home.intro.guide")}
        </span>
      </section>}

      {variant === "showcase" && <FeatureShowcase />}
      {variant === "sections" && SECTIONS.map((s) => (
        <FeatureSection data={s} key={s.num} />
      ))}

      <footer className="sm-footer">
        <div className="sm-footer-top">
          <div className="sm-footer-kicker">{t("home.footer.kicker")}</div>
          <h2 className="sm-footer-h2">{t("home.footer.h2")}</h2>
          <p className="sm-footer-p">{t("home.footer.p")}</p>
          <div className="sm-footer-cta">
            <span className="sm-footer-primary" onClick={goSignup}>{ctaLabel}</span>
          </div>
        </div>

        <div className="sm-rule" />
        <div className="sm-footer-bottom">
          <div className="sm-footer-brand">
            <span>StoryMode</span>
          </div>
          <div className="sm-footer-menu">
            {!user && <span className="sm-footer-login" onClick={goLogin}>{t("home.nav.login")}</span>}
            <span className="sm-footer-pill" onClick={goSignup}>{ctaLabel}</span>
          </div>
        </div>
        <div className="sm-footer-fine">storymode.waldenpond.net</div>
      </footer>
    </div>
  );
}