import { useEffect, useRef } from "react";

const edenMobile = "/backgrounds/eden-mobile.png";
const edenIpad = "/backgrounds/eden-ipad.png";
const edenDesktop = "/backgrounds/eden-desktop.png";

export function LandingBackgroundPaint({ enabled }: { enabled: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRef = useRef<{ x: number; y: number; t: number } | null>(null);
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
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const erase = (clientX: number, clientY: number) => {
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

      const baseR = Math.max(45, Math.min(window.innerWidth, window.innerHeight) * 0.09);
      const radius = baseR + Math.min(60, speed * 20);

      ctx.globalCompositeOperation = "destination-out";
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.6, "rgba(0,0,0,0.6)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (last) {
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = radius * 1.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const onMove = (e: PointerEvent) => erase(e.clientX, e.clientY);
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
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 size-full overflow-hidden">
      <picture>
        <source media="(min-width: 1024px)" srcSet={edenDesktop} />
        <source media="(min-width: 640px)" srcSet={edenIpad} />
        <img src={edenMobile} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
      </picture>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}