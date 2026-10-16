import { useEffect } from "react";
import type { BackgroundImage } from "@/lib/backgrounds";

/**
 * Inject a <link rel="preload"> for the chosen background so the browser
 * fetches it with high priority and caches it long-term (Supabase storage
 * already serves the bucket with long-lived Cache-Control headers, so
 * subsequent visits hit the disk cache instead of re-downloading).
 */
export function useBackgroundPreload(url: string) {
  useEffect(() => {
    if (!url) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = url;
    link.fetchPriority = "high" as any;
    document.head.appendChild(link);
    return () => {
      try { document.head.removeChild(link); } catch { /* ignore */ }
    };
  }, [url]);
}

export function BackgroundCredit({ background }: { background: BackgroundImage }) {
  return (
    <div className="pointer-events-none absolute bottom-3 right-4 z-20 text-[10px] uppercase tracking-[0.2em] text-white/55 font-mono select-none">
      {background.artist} · {background.title} · {background.year}
    </div>
  );
}
