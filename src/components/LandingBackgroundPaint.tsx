import { useEffect, useRef } from "react";

// Plant greens, water tones and earth colors (no orange/red/yellow/blue primaries)
const EARTH = [
  // Plant greens
  "#1f3a1f", "#2e5a2a", "#3f6b3a", "#5a8a4e",
  "#86a96b", "#a8c48a", "#c8dca4", "#4a7c3a",
  "#6b8e23",
  // Water tones
  "#2b6e6a", "#3c9a8f", "#7ec8c0", "#bfe3df",
  "#5a8aa0", "#9bbfd0",
  // Earth tones
  "#5a3a22", "#7a5230", "#a07248", "#c69b6d",
  "#d8b48a", "#e8d2a8",
];

export function LandingBackgroundPaint({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const hueRef = useRef(0);
  const enabledRef = useRef(enabled);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const paint = (clientX: number, clientY: number) => {
      if (!enabledRef.current) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const x = clientX, y = clientY;
      const now = performance.now();
      const last = lastRef.current;
      let speed = 0;
      if (last) {
        const dx = x - last.x, dy = y - last.y, dt = Math.max(1, now - last.t);
        speed = Math.hypot(dx, dy) / dt;
      }
      lastRef.current = { x, y, t: now };

      const baseR = Math.max(40, Math.min(window.innerWidth, window.innerHeight) * 0.08);
      const radius = baseR + Math.min(60, speed * 20);
      hueRef.current = (hueRef.current + 1) % EARTH.length;
      const color = EARTH[hueRef.current];

      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, color + "cc");
      grad.addColorStop(0.5, color + "66");
      grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (last) {
        ctx.strokeStyle = color + "88";
        ctx.lineWidth = radius * 0.7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    };

    const onMove = (e: PointerEvent) => paint(e.clientX, e.clientY);
    const onLeave = () => { lastRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 size-full"
    />
  );
}