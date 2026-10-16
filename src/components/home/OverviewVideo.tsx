import { useEffect, useRef, useState } from "react";
import { SpeakerSimpleHigh, SpeakerSimpleSlash } from "@/components/ui/icons";
import overviewVideo from "@/assets/home/video-overview.mp4.asset.json";

/**
 * Overview video framed in a glass card, with a scroll-driven 3D tilt
 * that settles as the frame comes into view.
 */
export function OverviewVideo() {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Scroll-driven 3D tilt
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let ticking = false;

    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      const r = frame.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const start = vh;
      const end = vh * 0.48 - r.height / 2;
      const p = Math.min(1, Math.max(0, (start - r.top) / (start - end)));
      const ease = 1 - Math.pow(1 - p, 3);
      const rot = 24 * (1 - ease);
      const ty = 60 * (1 - ease);
      const sc = 0.94 + 0.06 * ease;
      frame.style.transform = `perspective(1400px) rotateX(${rot.toFixed(2)}deg) translateY(${ty.toFixed(1)}px) scale(${sc.toFixed(3)})`;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Play when in view with audio, pause when out
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = 1;

    // Try to play with sound; if the browser blocks unmuted autoplay,
    // fall back to muted playback so the video always starts.
    const start = async () => {
      v.muted = false;
      v.defaultMuted = false;
      try {
        await v.play();
        setMuted(false);
      } catch {
        v.muted = true;
        v.defaultMuted = true;
        setMuted(true);
        try {
          await v.play();
        } catch {
          /* ignore */
        }
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) void start();
          else v.pause();
        });
      },
      { threshold: 0.25 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, []);


  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    if (!next) {
      v.volume = 1;
      v.play().catch(() => {});
    }
    setMuted(next);
  };

  return (
    <div
      ref={frameRef}
      className="sm-overview-frame"
      style={{ transformStyle: "preserve-3d", willChange: "transform" }}
    >
      <div className="sm-overview-shadow" />
      <div className="sm-overview-glass">
        <div
          className="sm-overview-screen"
          onClick={toggleSound}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <video
            ref={videoRef}
            src={overviewVideo.url}
            muted
            loop
            playsInline
            preload="auto"
          />
          <div
            className="sm-overview-mute"
            style={{ opacity: hovered ? 0.38 : 0 }}
            aria-hidden="true"
          >
            {muted ? <SpeakerSimpleSlash size={20} /> : <SpeakerSimpleHigh size={20} />}
          </div>
        </div>
      </div>
    </div>
  );
}
