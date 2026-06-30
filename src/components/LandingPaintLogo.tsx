import { useEffect, useRef } from "react";
import logoAsset from "@/assets/formai-logo-bubble-cut.png.asset.json";

// Vivid watercolor palette
const PALETTE = [
  "#ff3b30", "#ff9500", "#ffcc00", "#34c759",
  "#00c7be", "#007aff", "#5856d6", "#af52de",
  "#ff2d55", "#5ac8fa",
];

export function LandingPaintLogo() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const hueRef = useRef(0);
  const turbRef = useRef<SVGFEDisplacementMapElement>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const paint = (clientX: number, clientY: number) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const r = wrap.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      const now = performance.now();
      const last = lastRef.current;
      let speed = 0;
      if (last) {
        const dx = x - last.x, dy = y - last.y, dt = Math.max(1, now - last.t);
        speed = Math.hypot(dx, dy) / dt;
      }
      lastRef.current = { x, y, t: now };

      const baseR = Math.max(18, Math.min(r.width, r.height) * 0.06);
      const radius = baseR + Math.min(28, speed * 12);
      hueRef.current = (hueRef.current + 7) % PALETTE.length;
      const color = PALETTE[Math.floor(hueRef.current)];

      // Soft watercolor blob
      const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grad.addColorStop(0, color + "ee");
      grad.addColorStop(0.5, color + "88");
      grad.addColorStop(1, color + "00");
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      // Connect with last point for continuous stroke
      if (last) {
        ctx.strokeStyle = color + "cc";
        ctx.lineWidth = radius * 0.9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Water flow intensity follows speed
      const turb = turbRef.current;
      if (turb) {
        const scale = Math.min(40, 8 + speed * 30);
        turb.setAttribute("scale", String(scale));
      }
    };

    const onMove = (e: PointerEvent) => { activeRef.current = true; paint(e.clientX, e.clientY); };
    const onLeave = () => {
      lastRef.current = null;
      activeRef.current = false;
      const turb = turbRef.current;
      if (turb) turb.setAttribute("scale", "0");
    };

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);

    // Water-flow drift only while cursor is over the logo
    let raf = 0;
    let t = 0;
    const tick = () => {
      if (activeRef.current) {
        t += 0.012;
        const turb = turbRef.current;
        if (turb) {
          const baseFreq = 0.012 + Math.sin(t * 0.7) * 0.004;
          const parent = turb.parentElement;
          const turbNode = parent?.querySelector("feTurbulence");
          turbNode?.setAttribute("baseFrequency", String(baseFreq));
          turbNode?.setAttribute("seed", String(Math.floor((Math.sin(t) * 3 + 5) * 100)));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const maskStyle = {
    WebkitMaskImage: `url(${logoAsset.url})`,
    maskImage: `url(${logoAsset.url})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  } as React.CSSProperties;

  return (
    <div
      ref={wrapRef}
      className="relative aspect-square select-none"
      style={{ width: "50vmin", height: "50vmin", filter: "url(#landing-water)" }}
    >
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <filter id="landing-water" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="2" seed="2" result="noise" />
            <feDisplacementMap ref={turbRef} in="SourceGraphic" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <img
        src={logoAsset.url}
        alt="FORM AI"
        draggable={false}
        className="absolute inset-0 size-full object-contain"
      />
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 size-full"
        style={maskStyle}
      />
    </div>
  );
}