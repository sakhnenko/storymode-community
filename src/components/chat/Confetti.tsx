import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./chat-script";

const COLORS = ["#e11d48", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#fde68a", "#ffffff"];
const PIECES = 180;
const DURATION_MS = 3200;
const GRAVITY = 0.25;

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  shape: number;
}

/** Full-screen confetti from both bottom corners. Each new `fireKey` above 0 fires a burst. */
export function Confetti({ fireKey }: { fireKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (fireKey <= 0 || prefersReducedMotion()) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Launch speed scales with the viewport so the burst reaches about halfway up.
    const baseSpeed = Math.sqrt(2 * GRAVITY * height * 0.55);
    const pieces: Piece[] = Array.from({ length: PIECES }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = ((fromLeft ? -62 : -118) + (Math.random() - 0.5) * 36) * (Math.PI / 180);
      const speed = baseSpeed * (0.75 + Math.random() * 0.45);
      return {
        x: fromLeft ? width * 0.08 : width * 0.92,
        y: height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.3,
        shape: i % 3,
      };
    });

    const start = performance.now();
    let frame = 0;
    const draw = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - DURATION_MS * 0.6) / (DURATION_MS * 0.4));
      for (const p of pieces) {
        p.vy += GRAVITY;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        if (p.shape === 0) {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 4, -p.size / 2, p.size / 2, p.size);
        }
        ctx.restore();
      }
      if (elapsed < DURATION_MS) {
        frame = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
    };
  }, [fireKey]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
