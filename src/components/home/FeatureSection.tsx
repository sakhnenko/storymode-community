import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import featureFolios from "@/assets/feature-folios.png";
import featureTimeline from "@/assets/feature-timeline.png";
import featureMaps from "@/assets/feature-maps.png";
import featureStory from "@/assets/feature-story.png";

interface Feature {
  tag: string;
  title: string;
  titleAccent?: string;
  description: string;
  image: string;
}

const features: Feature[] = [
  {
    tag: "Story",
    title: "Write with the world at your fingertips.",
    description:
      "A distraction-free manuscript editor with your folios, characters, and lore one glance away. Chapter outline on the left, your prose in the middle, every note you'll ever need on the right — no more hunting through tabs mid-sentence.",
    image: featureStory
  },
  {
    tag: "Folios",
    title: "Organize your ideas into plot.",
    description:
      "Characters, chapters, red herrings, that one scene you wrote at 3 AM — arrange them on a canvas of cards you can theme, resize, and shuffle until the story clicks.",
    image: featureFolios
  },
  {
    tag: "Timeline",
    title: "Untangle your timeline.",
    description:
      "Track parallel plotlines, flashbacks, and the slow burn that spans four generations. Zoom from epochs to single afternoons. Your readers will never catch a contradiction.",
    image: featureTimeline
  },
  {
    tag: "Maps",
    title: "Every world starts with a blank map.",
    description:
      "Paint continents or city blocks. Pin notes to the tavern where the deal happens, the border where the war starts. Because \"somewhere far away\" isn't a direction. When your world has a map, your characters stop getting lost — and so do you.",
    image: featureMaps
  }
];


export function FeatureSection() {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  return (
    <>
      {/* SVG displacement filter for real liquid-glass refraction at frame edges */}
      <svg className="absolute -top-[9999px] -left-[9999px] w-0 h-0" aria-hidden="true">
        <defs>
          <filter id="liquid-glass-edge" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="1.2" result="softNoise" />
            <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="18" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <section
        className="relative overflow-hidden"
        style={{ backgroundColor: "hsl(220, 20%, 97%)" }}>

        {/* Ambient background glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-[5%] right-[-8%] w-[600px] h-[600px] rounded-full blur-[140px]"
            style={{ backgroundColor: "hsl(230, 60%, 88%)", opacity: 0.45 }} />
          <div
            className="absolute top-[45%] left-[-6%] w-[500px] h-[500px] rounded-full blur-[120px]"
            style={{ backgroundColor: "hsl(10, 70%, 92%)", opacity: 0.4 }} />
          <div
            className="absolute bottom-[5%] right-[10%] w-[500px] h-[500px] rounded-full blur-[130px]"
            style={{ backgroundColor: "hsl(160, 50%, 90%)", opacity: 0.35 }} />
        </div>

        <div className="relative w-full px-6 md:px-12 lg:px-20 pt-10 md:pt-12 pb-32 flex flex-col gap-32 md:gap-40 max-w-6xl mx-auto">
          {/* Section intro */}
          <div className="text-center max-w-5xl mx-auto">
            <h2
              className="text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight"
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontWeight: 400,
                color: "hsl(220, 25%, 12%)"
              }}>
              Build your world.{" "}
              <span className="italic" style={{ color: "hsl(172, 30%, 45%)" }}>Plan your plot.</span>{" "}
              <br />
              Tell your story.
            </h2>
          </div>

          {/* Feature cards */}
          {features.map((f, i) => {
            // Layout per section:
            // 0 Story   → side-by-side, image LEFT
            // 1 Folios  → side-by-side, image RIGHT
            // 2 Timeline → stacked (image below text)
            // 3 Maps    → side-by-side, image RIGHT
            const stacked = i === 2;
            const imageLeft = i === 0;

            const copy = (
              <div className={`space-y-6 z-10 ${stacked ? "max-w-2xl mx-auto text-center" : ""}`}>
                <div
                  className="inline-flex items-center px-3 py-1.5 rounded-full border shadow-sm"
                  style={{
                    backgroundColor: "hsl(172, 30%, 95% / 0.7)",
                    borderColor: "hsl(172, 30%, 80% / 0.6)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)"
                  }}>
                  <span
                    className="text-[10px] tracking-[0.25em] uppercase"
                    style={{
                      fontFamily: "'Boulder Mono', monospace",
                      fontWeight: 600,
                      color: "hsl(172, 30%, 38%)"
                    }}>
                    {f.tag}
                  </span>
                </div>
                <h3
                  className="text-3xl md:text-4xl lg:text-5xl leading-[1.05] tracking-tight"
                  style={{
                    fontFamily: "'Instrument Serif', serif",
                    fontWeight: 400,
                    color: "hsl(220, 25%, 10%)"
                  }}>
                  {f.title}
                  {f.titleAccent && (
                    <span className="italic" style={{ color: "hsl(172, 30%, 45%)" }}>
                      {f.titleAccent}
                    </span>
                  )}
                </h3>
                <p
                  className={`text-base md:text-lg leading-relaxed ${stacked ? "mx-auto" : ""}`}
                  style={{
                    fontFamily: "var(--font-source)",
                    fontWeight: 400,
                    color: "hsl(220, 12%, 38%)",
                    maxWidth: stacked ? "42rem" : "28rem"
                  }}>
                  {f.description}
                </p>
              </div>
            );

            const image = (
              <div className={`relative group ${stacked ? "w-full" : ""}`}>
                {/* Glow halo */}
                <div
                  className="absolute -inset-10 rounded-[20px] blur-3xl opacity-70 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                  style={{
                    background:
                      i === 0
                        ? "linear-gradient(135deg, hsl(172, 50%, 88% / 0.55), hsl(220, 60%, 92% / 0.3))"
                        : i === 1
                        ? "linear-gradient(135deg, hsl(172, 50%, 90% / 0.5), hsl(220, 50%, 92% / 0.35))"
                        : "linear-gradient(135deg, hsl(172, 50%, 88% / 0.5), hsl(40, 60%, 92% / 0.3))"
                  }} />
                <button
                  type="button"
                  onClick={() => setLightboxImage(f.image)}
                  className="relative block w-full rounded-[10px] overflow-hidden cursor-zoom-in"
                  style={{
                    boxShadow:
                      "0 30px 70px -25px hsl(220 30% 15% / 0.22), 0 2px 6px hsl(220 30% 15% / 0.06)"
                  }}>
                  {/* The screenshot fills the frame */}
                  <img
                    src={f.image}
                    alt={`${f.tag} screenshot`}
                    className="w-full h-auto block transition-transform duration-700 ease-out group-hover:scale-[1.02]"
                    loading="lazy" />

                  {/* Liquid-glass bezel sitting ON TOP of the image edges.
                      backdrop-filter blurs the screenshot pixels directly beneath this ring. */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[10px] pointer-events-none"
                    style={{
                      padding: "7px",
                      backgroundColor: "hsl(0, 0%, 100% / 0.18)",
                      backdropFilter: "blur(14px) saturate(180%)",
                      WebkitBackdropFilter: "blur(14px) saturate(180%)",
                      // Cut the center out so only the border ring remains as glass
                      WebkitMask:
                        "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                      mask:
                        "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                      WebkitMaskComposite: "xor",
                      maskComposite: "exclude",
                      boxShadow:
                        // top specular highlight
                        "inset 0 1px 0 hsl(0 0% 100% / 0.9)," +
                        // bottom catch-light
                        "inset 0 -1px 0 hsl(0 0% 100% / 0.25)," +
                        // outer hairline
                        "inset 0 0 0 1px hsl(0 0% 100% / 0.35)"
                    }} />

                  {/* Diagonal specular sweep across the bezel */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 rounded-[10px] pointer-events-none"
                    style={{
                      padding: "7px",
                      background:
                        "linear-gradient(135deg, hsl(0 0% 100% / 0.55) 0%, hsl(0 0% 100% / 0.1) 22%, hsl(0 0% 100% / 0) 45%, hsl(0 0% 100% / 0) 70%, hsl(0 0% 100% / 0.25) 100%)",
                      WebkitMask:
                        "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                      mask:
                        "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                      WebkitMaskComposite: "xor",
                      maskComposite: "exclude",
                      mixBlendMode: "overlay",
                      opacity: 0.9
                    }} />

                  {/* Hover overlay */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center"
                    style={{ background: "hsl(220 25% 8% / 0.2)" }}>
                    <span
                      className="text-xs tracking-[0.25em] uppercase px-4 py-2 rounded-full"
                      style={{
                        fontFamily: "'Boulder Mono', monospace",
                        fontWeight: 500,
                        color: "hsl(0, 0%, 100%)",
                        backgroundColor: "hsl(220 25% 8% / 0.45)",
                        backdropFilter: "blur(10px)"
                      }}>
                      Click to enlarge
                    </span>
                  </div>
                </button>
              </div>
            );

            if (stacked) {
              return (
                <section
                  key={f.tag}
                  className="relative max-w-5xl mx-auto w-full flex flex-col gap-14 items-center">
                  {copy}
                  {image}
                </section>
              );
            }

            return (
              <section
                key={f.tag}
                className={`relative max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center ${
                  imageLeft
                    ? "lg:[&>*:first-child]:col-span-4 lg:[&>*:last-child]:col-span-8 lg:[&>*:first-child]:order-2"
                    : "lg:[&>*:first-child]:col-span-4 lg:[&>*:last-child]:col-span-8"
                }`}>
                {copy}
                {image}
              </section>
            );
          })}
        </div>
      </section>

      {/* Lightbox */}
      <Dialog
        open={!!lightboxImage}
        onOpenChange={(open) => !open && setLightboxImage(null)}>
        
        <DialogContent
          className="max-w-[92vw] max-h-[92vh] p-2 border-none bg-transparent shadow-none [&>button]:text-white [&>button]:bg-black/50 [&>button]:rounded-full [&>button]:p-1">
          
          {lightboxImage &&
          <img
            src={lightboxImage}
            alt="Feature detail"
            className="w-full h-auto rounded-lg"
            style={{
              maxHeight: "88vh",
              objectFit: "contain"
            }} />

          }
        </DialogContent>
      </Dialog>
    </>);

}