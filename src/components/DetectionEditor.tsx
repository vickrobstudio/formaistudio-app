import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Paintbrush, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DetectedCategory, DetectedElement } from "@/lib/floor-detect.functions";
import { streamImage } from "@/lib/stream-image";

export type FloorPlanInput = {
  index: number;
  label: string;
  imageDataUrl: string;
};

export type FloorDetection = {
  elements: DetectedElement[];
  hidden: Record<string, boolean>;
  colors: Partial<Record<DetectedCategory, string>>;
  /** Cleaned, text-free, transparent-background line drawing (PNG data URL). */
  replannedDataUrl?: string;
  /** Per-element painted pixel mask serialized as PNG data URL — visual paint state. */
  paintedDataUrl?: string;
  planWidthMeters?: number;
  calibration?: { elementId: string; category: DetectedCategory; assumedMeters: number };
};

const DEFAULT_COLORS: Record<DetectedCategory, string> = {
  wall: "#111111",
  door: "#2E7D32",
  window: "#1565C0",
  stair: "#8E24AA",
  room: "#F4A261",
  fixture: "#E76F51",
};

const CATEGORY_ORDER: DetectedCategory[] = ["wall", "door", "window", "stair", "room", "fixture"];
const CATEGORY_LABEL: Record<DetectedCategory, string> = {
  wall: "Walls",
  door: "Doors",
  window: "Windows",
  stair: "Stairs",
  room: "Rooms",
  fixture: "Fixtures",
};

// Standard real-world short-side dimensions (meters) used to calibrate plan
// scale from a painted reference shape.
const REFERENCE_SHORT_SIDE_METERS: Record<DetectedCategory, number | null> = {
  door: 0.9,
  window: 1.2,
  wall: 0.15,
  stair: 0.28,
  fixture: 0.6096,
  room: null,
};

/**
 * Convert a cleaned floor plan image into a transparent PNG: anything dark
 * (the line work) stays opaque black; everything light becomes fully
 * transparent. Returns { dataUrl, width, height, mask } where mask[i] is 1
 * for "line pixel", 0 for "transparent".
 */
async function whiteToTransparent(dataUrl: string): Promise<{ dataUrl: string; width: number; height: number; mask: Uint8Array }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("Could not load cleaned image"));
    img.src = dataUrl;
  });
  // Cap working resolution so flood fill stays responsive.
  const MAX = 1600;
  const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Luma approximation
    const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    if (luma < 140) {
      // line pixel — force pure black, fully opaque
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
      mask[p] = 1;
    } else {
      // background — fully transparent
      data[i + 3] = 0;
      mask[p] = 0;
    }
  }
  ctx.putImageData(id, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), width: w, height: h, mask };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * 4-connected flood fill on the line mask starting from (sx, sy). Returns
 * the list of pixel indices that belong to the same connected line region,
 * plus its bounding box.
 */
function floodFillMask(mask: Uint8Array, w: number, h: number, sx: number, sy: number, target: 0 | 1): { pixels: number[]; bbox: [number, number, number, number]; touchedEdge: boolean } | null {
  const start = sy * w + sx;
  if (mask[start] !== target) return null;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [start];
  const pixels: number[] = [];
  let minX = sx, maxX = sx, minY = sy, maxY = sy;
  let touchedEdge = false;
  while (stack.length) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    if (mask[p] !== target) continue;
    pixels.push(p);
    const x = p % w, y = (p - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchedEdge = true;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
    // Cap region size for safety on huge plans.
    if (pixels.length > 2_000_000) break;
  }
  return { pixels, bbox: [minX, minY, maxX, maxY], touchedEdge };
}

export function DetectionEditor({
  floors,
  detections,
  onDetectionsChange,
}: {
  floors: FloorPlanInput[];
  detections: Record<number, FloorDetection>;
  onDetectionsChange: (next: Record<number, FloorDetection>) => void;
}) {
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [activeIndex, setActiveIndex] = useState<number>(floors[0]?.index ?? 0);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [paintCategory, setPaintCategory] = useState<DetectedCategory | null>(null);

  // Per-floor cached working data: line mask + canvas refs + dimensions.
  const workingRef = useRef<Record<number, { width: number; height: number; mask: Uint8Array }>>({});
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);

  function pushLog(line: string) { setProgressLog((p) => [...p, line]); }

  const activeFloor = floors.find((f) => f.index === activeIndex) ?? floors[0];
  const activeDetection = activeFloor ? detections[activeFloor.index] : undefined;

  const totalPainted = useMemo(
    () => Object.values(detections).reduce((s, d) => s + (d?.elements.length ?? 0), 0),
    [detections],
  );

  // When the active floor's cleaned (transparent) image changes, redraw the
  // paint canvas from the saved paintedDataUrl (if any) so paint persists
  // across re-renders / floor switches.
  useEffect(() => {
    const canvas = paintCanvasRef.current;
    const work = activeFloor ? workingRef.current[activeFloor.index] : undefined;
    if (!canvas || !work) return;
    canvas.width = work.width;
    canvas.height = work.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const saved = activeDetection?.paintedDataUrl;
    if (!saved) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = saved;
  }, [activeFloor, activeDetection?.paintedDataUrl, activeDetection?.replannedDataUrl]);

  async function prepare(floor: FloorPlanInput) {
    setError("");
    setBusyIndex(floor.index);
    try {
      let cleanedUrl = detections[floor.index]?.replannedDataUrl ?? "";
      if (!cleanedUrl) {
        pushLog(`${floor.label}: erasing every letter, number, dimension line and callout…`);
        const cleanPrompt = `Redraw this floor plan as a CLEAN PURE-BLACK-OUTLINE-ON-WHITE technical drawing.\n\nABSOLUTE RULES — these are non-negotiable:\n- DELETE every letter, number, word, label, room name, dimension, measurement, leader line, arrow, tick mark, scale bar, north arrow, callout, legend, title block, stamp, signature, sheet number, hatching, shading, color and texture. There must be ZERO TEXT and ZERO NUMBERS anywhere in the output.\n- Keep ONLY the geometric line work: walls, door openings (with swing arcs), window openings, stair treads, and fixed fixtures (toilets, sinks, tubs, counters, stoves).\n- Render as pure 1-pixel-to-3-pixel black ink lines on a 100% pure white background. No greys, no fills, no gradients, no shadows.\n- Preserve the EXACT outline, proportions, room positions and opening positions of the source.\n- Top-down orthographic 2D view. No perspective. No 3D.\n\nThe output is a clean black-outline floor plan ready for a human to paint each line by hand.`;
        let aiUrl = "";
        await streamImage(cleanPrompt, floor.imageDataUrl, (src, isFinal) => { if (isFinal) aiUrl = src; });
        if (!aiUrl) throw new Error("Could not strip text from the drawing.");
        pushLog(`${floor.label}: text removed. Converting white to transparent…`);
        const { dataUrl, width, height, mask } = await whiteToTransparent(aiUrl);
        cleanedUrl = dataUrl;
        workingRef.current[floor.index] = { width, height, mask };
        pushLog(`${floor.label}: ready to paint. Pick a legend color and tap any black line.`);
      } else if (!workingRef.current[floor.index]) {
        // Rebuild mask from saved cleaned image (after a refresh / first mount).
        const { width, height, mask } = await whiteToTransparent(cleanedUrl);
        workingRef.current[floor.index] = { width, height, mask };
      }
      onDetectionsChange({
        ...detections,
        [floor.index]: {
          elements: detections[floor.index]?.elements ?? [],
          hidden: detections[floor.index]?.hidden ?? {},
          colors: { ...DEFAULT_COLORS, ...(detections[floor.index]?.colors ?? {}) },
          replannedDataUrl: cleanedUrl,
          paintedDataUrl: detections[floor.index]?.paintedDataUrl,
          planWidthMeters: detections[floor.index]?.planWidthMeters,
          calibration: detections[floor.index]?.calibration,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preparation failed.");
    } finally {
      setBusyIndex(null);
    }
  }

  async function prepareAll() {
    setProgressLog([]);
    const ordered = [...floors].sort((a, b) => a.index - b.index);
    for (const f of ordered) {
      setActiveIndex(f.index);
      // eslint-disable-next-line no-await-in-loop
      await prepare(f);
    }
    pushLog("All floors cleaned. Pick a legend color and paint each line yourself.");
  }

  function handlePaintClick(evt: React.MouseEvent<HTMLCanvasElement>) {
    if (!activeFloor || !activeDetection || !paintCategory) return;
    const canvas = paintCanvasRef.current;
    const work = workingRef.current[activeFloor.index];
    if (!canvas || !work) return;
    const rect = canvas.getBoundingClientRect();
    const sx = Math.floor(((evt.clientX - rect.left) / rect.width) * work.width);
    const sy = Math.floor(((evt.clientY - rect.top) / rect.height) * work.height);
    if (sx < 0 || sy < 0 || sx >= work.width || sy >= work.height) return;
    const fill = floodFillMask(work.mask, work.width, work.height, sx, sy, 0);
    if (!fill || fill.pixels.length < 4) {
      pushLog("That spot is on a black line — click INSIDE a contour to paint it.");
      return;
    }
    if (fill.touchedEdge) {
      pushLog("That area isn't fully enclosed (the fill reached the edge). Painting it anyway — close gaps in the outline for cleaner shapes.");
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const [r, g, b] = hexToRgb(activeDetection.colors[paintCategory] ?? DEFAULT_COLORS[paintCategory]);
    const id = ctx.getImageData(0, 0, work.width, work.height);
    for (const p of fill.pixels) {
      const i = p * 4;
      id.data[i] = r; id.data[i + 1] = g; id.data[i + 2] = b; id.data[i + 3] = 235;
    }
    ctx.putImageData(id, 0, 0);
    const [minX, minY, maxX, maxY] = fill.bbox;
    const newId = `paint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const polygon: Array<[number, number]> = [
      [minX / work.width, minY / work.height],
      [maxX / work.width, minY / work.height],
      [maxX / work.width, maxY / work.height],
      [minX / work.width, maxY / work.height],
    ];
    const newElement: DetectedElement = {
      id: newId,
      category: paintCategory,
      label: `${CATEGORY_LABEL[paintCategory].slice(0, -1)} ${activeDetection.elements.filter((e) => e.category === paintCategory).length + 1}`,
      polygon,
      confidence: 1,
    };
    // Calibrate scale from the painted region's short side, if applicable.
    let planWidthMeters = activeDetection.planWidthMeters;
    let calibration = activeDetection.calibration;
    const refM = REFERENCE_SHORT_SIDE_METERS[paintCategory];
    if (refM) {
      const shortPx = Math.min(maxX - minX, maxY - minY);
      if (shortPx > 1) {
        const inferred = (refM * work.width) / shortPx;
        const clamped = Math.min(120, Math.max(2, inferred));
        planWidthMeters = clamped;
        calibration = { elementId: newId, category: paintCategory, assumedMeters: refM };
        const note = paintCategory === "fixture"
          ? `kitchen cabinet depth ≈ 24 in (0.61 m)`
          : `${CATEGORY_LABEL[paintCategory].toLowerCase()} ≈ ${refM} m`;
        pushLog(`Calibrated from ${note} → plan is about ${clamped.toFixed(1)} m wide.`);
      }
    }
    const paintedDataUrl = canvas.toDataURL("image/png");
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: {
        ...activeDetection,
        elements: [...activeDetection.elements, newElement],
        paintedDataUrl,
        planWidthMeters,
        calibration,
      },
    });
  }

  function clearPaint() {
    if (!activeFloor || !activeDetection) return;
    const canvas = paintCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: {
        ...activeDetection,
        elements: [],
        paintedDataUrl: undefined,
        planWidthMeters: undefined,
        calibration: undefined,
      },
    });
  }

  function setCategoryColor(cat: DetectedCategory, color: string) {
    if (!activeFloor || !activeDetection) return;
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: {
        ...activeDetection,
        colors: { ...activeDetection.colors, [cat]: color },
      },
    });
  }

  const colors = { ...DEFAULT_COLORS, ...(activeDetection?.colors ?? {}) };
  const displayUrl = activeDetection?.replannedDataUrl ?? activeFloor?.imageDataUrl;

  return <div className="mt-6 rounded-2xl border border-foreground/30 bg-background p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Step · Clean &amp; paint each line</p>
        <p className="mt-1 text-xs text-muted-foreground">
          AI strips every letter, number and dimension from your plan and makes the white background transparent.
          Then YOU paint each black line — walls, doors, windows, stairs, rooms or fixtures — by picking a legend color
          and tapping the line. No auto-detect.
        </p>
        {totalPainted > 0 && <p className="mt-1 text-[11px] font-medium">{totalPainted} line{totalPainted === 1 ? "" : "s"} painted across {Object.keys(detections).length} floor{Object.keys(detections).length === 1 ? "" : "s"}.</p>}
      </div>
      <Button type="button" size="sm" onClick={() => void prepareAll()} disabled={busyIndex !== null || floors.length === 0}>
        {busyIndex !== null ? <LoaderCircle className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
        {Object.keys(detections).length === 0 ? "Clean all plans" : "Re-clean all plans"}
      </Button>
    </div>

    {floors.length > 1 && <div className="mt-3 flex flex-wrap gap-1">
      {floors.map((f) => <Button
        key={f.index}
        type="button"
        size="sm"
        variant={f.index === activeIndex ? "default" : "outline"}
        onClick={() => setActiveIndex(f.index)}
      >
        {f.label}
        {detections[f.index] && <span className="ml-1 text-[10px] opacity-70">· {detections[f.index].elements.length}</span>}
      </Button>)}
    </div>}

    {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}

    {progressLog.length > 0 && <div className="mt-3 max-h-32 overflow-y-auto rounded-xl border border-border bg-secondary/40 p-3 text-[11px] leading-relaxed">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">AI progress</p>
      <ol className="mt-1.5 space-y-1">
        {progressLog.map((line, i) => <li key={i} className="flex gap-2"><span className="text-muted-foreground">{i + 1}.</span><span>{line}</span></li>)}
      </ol>
    </div>}

    {activeFloor && <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_240px]">
      <div
        className="relative overflow-hidden rounded-xl border border-border"
        style={{
          // Subtle checker so transparent areas are obvious.
          backgroundImage:
            "linear-gradient(45deg, #e8e8e8 25%, transparent 25%), linear-gradient(-45deg, #e8e8e8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e8e8e8 75%), linear-gradient(-45deg, transparent 75%, #e8e8e8 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
          backgroundColor: "#fafafa",
        }}
      >
        <div className="relative">
          {displayUrl && <img src={displayUrl} alt={activeFloor.label} className="block w-full select-none" draggable={false} />}
          {activeDetection?.replannedDataUrl && <canvas
            ref={paintCanvasRef}
            onClick={paintCategory ? handlePaintClick : undefined}
            className={`absolute inset-0 size-full ${paintCategory ? "cursor-crosshair" : "pointer-events-none"}`}
          />}
        </div>
        {!activeDetection?.replannedDataUrl && <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm">
          <Button type="button" size="sm" onClick={() => void prepare(activeFloor)} disabled={busyIndex !== null}>
            {busyIndex === activeFloor.index ? <LoaderCircle className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            Clean this plan
          </Button>
        </div>}
        {busyIndex === activeFloor.index && <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]"><LoaderCircle className="size-3 animate-spin" />Cleaning…</p>
        </div>}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Legend · tap to pick paint color</p>
          {paintCategory && <p className="mt-1 text-[10px] text-foreground/80 inline-flex items-center gap-1"><Paintbrush className="size-3" />Painting <span className="font-semibold">{CATEGORY_LABEL[paintCategory]}</span> · tap a black line. <button type="button" className="underline" onClick={() => setPaintCategory(null)}>Stop</button></p>}
          {activeDetection?.planWidthMeters && activeDetection?.calibration && <p className="mt-1 text-[10px] text-foreground/80">Scale locked: {CATEGORY_LABEL[activeDetection.calibration.category].toLowerCase()} ≈ {activeDetection.calibration.assumedMeters} m → plan ≈ <span className="font-semibold">{activeDetection.planWidthMeters.toFixed(1)} m</span> wide.</p>}
          <ul className="mt-2 space-y-1.5">
            {CATEGORY_ORDER.map((cat) => {
              const count = activeDetection?.elements.filter((e) => e.category === cat).length ?? 0;
              const isPainting = paintCategory === cat;
              return <li key={cat} className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-[11px] ${isPainting ? "bg-foreground/5 ring-1 ring-foreground/30" : ""}`}>
                <input
                  type="color"
                  value={colors[cat]}
                  onChange={(e) => setCategoryColor(cat, e.target.value)}
                  className="size-4 cursor-pointer rounded border border-border bg-transparent"
                  aria-label={`${CATEGORY_LABEL[cat]} color`}
                />
                <button
                  type="button"
                  className="flex-1 text-left hover:underline"
                  onClick={() => setPaintCategory(isPainting ? null : cat)}
                  disabled={!activeDetection?.replannedDataUrl}
                >{CATEGORY_LABEL[cat]}</button>
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </li>;
            })}
          </ul>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={clearPaint} disabled={!activeDetection?.replannedDataUrl || (activeDetection?.elements.length ?? 0) === 0}>
            <Undo2 className="size-3" />
            Clear paint on this floor
          </Button>
        </div>
      </div>
    </div>}
  </div>;
}