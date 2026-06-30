import { useEffect, useRef } from "react";
import logoAsset from "@/assets/formai-logo-bubble-cut.png.asset.json";

// Per-letter colors. Coordinates are normalized 0-1 within the square logo bbox.
const COLOR_F = "#1438a0";   // Bauhaus blue
const COLOR_O = "#d8261b";   // red
const COLOR_R = "#ffd500";   // yellow
const COLOR_M = "#ffffff";   // white
const COLOR_AI = "#000000";  // black (always)

function colorForPoint(nx: number, ny: number): string {
  // AI badge (small, top-right) takes priority
  if (nx > 0.62 && nx < 0.88 && ny > 0.28 && ny < 0.50) return COLOR_AI;
  // Top row: F (left), O (right)
  if (ny < 0.52) {
    if (nx < 0.36) return COLOR_F;
    return COLOR_O;
  }
  // Bottom row: R (left), M (right)
  if (nx < 0.55) {
    // F descends through the left column too — keep F color on far left
    if (nx < 0.28) return COLOR_F;
    return COLOR_R;
  }
  return COLOR_M;
}

export function LandingPaintLogo({ onComplete }: { onComplete?: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    // Offscreen mask for coverage measurement
    const SAMPLE = 96;
    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = SAMPLE;
    sampleCanvas.height = SAMPLE;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    let paintableTotal = 0;
    const maskImg = new Image();
    maskImg.crossOrigin = "anonymous";
    maskImg.src = logoAsset.url;
    maskImg.onload = () => {
      if (!sampleCtx) return;
      sampleCtx.clearRect(0, 0, SAMPLE, SAMPLE);
      // Fit contain
      const ar = maskImg.width / maskImg.height;
      let w = SAMPLE, h = SAMPLE;
      if (ar > 1) h = SAMPLE / ar; else w = SAMPLE * ar;
      sampleCtx.drawImage(maskImg, (SAMPLE - w) / 2, (SAMPLE - h) / 2, w, h);
      const data = sampleCtx.getImageData(0, 0, SAMPLE, SAMPLE).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 32) n++;
      paintableTotal = n;
    };

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

    let lastCheck = 0;
    const checkCoverage = () => {
      if (completedRef.current || !sampleCtx || !paintableTotal) return;
      sampleCtx.clearRect(0, 0, SAMPLE, SAMPLE);
      sampleCtx.drawImage(canvas, 0, 0, SAMPLE, SAMPLE);
      const data = sampleCtx.getImageData(0, 0, SAMPLE, SAMPLE).data;
      let n = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 32) n++;
      if (n / paintableTotal > 0.78) {
        completedRef.current = true;
        onComplete?.();
      }
    };

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
      const color = colorForPoint(x / r.width, y / r.height);

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

      if (now - lastCheck > 350) {
        lastCheck = now;
        checkCoverage();
      }
    };

    const onMove = (e: PointerEvent) => { paint(e.clientX, e.clientY); };
    const onLeave = () => { lastRef.current = null; };

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);

    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      ro.disconnect();
    };
  }, [onComplete]);

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
      className="relative z-10 aspect-square select-none"
      style={{ width: "50vmin", height: "50vmin" }}
    >
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