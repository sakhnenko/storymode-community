const DARK = "hsl(220, 18%, 12%)";
const LIGHT = "hsl(220, 20%, 97%)";

/**
 * Wavy + dithered transition between the dark hero (above) and the light
 * feature section (below). Evokes ink fading into newsprint paper.
 */
export function HeroTransition({ height = 90 }: { height?: number }) {
  const W = 1440;
  const H = height;
  // Wave sits near the top of the strip; the rest is the dissolve into paper.
  const baseY = 18;
  const amp = 2.5;        // tiny ripple
  const cycles = 28;      // tight, short-wavelength ripples
  const segments = 560;
  // Build a dark cap that covers the TOP of the strip with a wavy lower edge.
  let d = `M 0 0 L ${W} 0 L ${W} ${baseY}`;
  for (let i = segments; i >= 0; i--) {
    const x = (i / segments) * W;
    const t = (i / segments) * cycles * Math.PI * 2;
    const y = baseY + Math.sin(t) * amp;
    d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  d += " Z";

  return (
    <div
      aria-hidden="true"
      className="relative w-full pointer-events-none"
      style={{ height, zIndex: 5 }}
    >
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        <defs>
          {/* Halftone-ish dither: turbulence thresholded into crisp dark speckles */}
          <filter id="hero-dither" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="1.2"
              numOctaves="2"
              seed="4"
              result="noise"
            />
            <feComponentTransfer in="noise" result="thresh">
              <feFuncR type="discrete" tableValues="0 1" />
              <feFuncG type="discrete" tableValues="0 1" />
              <feFuncB type="discrete" tableValues="0 1" />
            </feComponentTransfer>
            <feColorMatrix
              in="thresh"
              type="matrix"
              values="0 0 0 0 0.07
                      0 0 0 0 0.09
                      0 0 0 0 0.13
                      1 0 0 0 0"
            />
          </filter>

          {/* Fade mask: speckles dense just below the wave, dissolve into paper */}
          <linearGradient id="hero-dither-mask" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset={`${(baseY / H) * 100}%`} stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id="hero-dither-fade" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
            <rect x="0" y="0" width={W} height={H} fill="url(#hero-dither-mask)" />
          </mask>
        </defs>

        {/* Light paper base (matches FeatureSection) */}
        <rect x="0" y="0" width={W} height={H} fill={LIGHT} />

        {/* Dark cap with tiny wavy lower edge (matches hero) */}
        <path d={d} fill={DARK} />

        {/* Dark dither speckles fading downward into the paper */}
        <g mask="url(#hero-dither-fade)">
          <rect x="0" y="0" width={W} height={H} filter="url(#hero-dither)" />
        </g>
      </svg>
    </div>
  );
}
