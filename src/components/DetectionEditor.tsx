import { useMemo, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Paintbrush, Sparkles, Wand2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { detectFloorElements, type DetectedCategory, type DetectedElement } from "@/lib/floor-detect.functions";
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
  replannedDataUrl?: string;
  /** Real-world width of the plan in meters, inferred from a painted reference shape. */
  planWidthMeters?: number;
  /** Which element id the scale was calibrated from + the category used. */
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

const CATEGORY_ORDER: DetectedCategory[] = ["room", "wall", "door", "window", "stair", "fixture"];
const CATEGORY_LABEL: Record<DetectedCategory, string> = {
  wall: "Walls",
  door: "Doors",
  window: "Windows",
  stair: "Stairs",
  room: "Rooms",
  fixture: "Fixtures",
};

// Standard real-world dimensions used to calibrate plan scale from a painted shape.
// We pick the SHORT side of the shape's bounding box, because that matches the
// architectural "width" of doors / windows / wall thickness / stair tread depth.
const REFERENCE_SHORT_SIDE_METERS: Record<DetectedCategory, number | null> = {
  door: 0.9,        // ~3 ft standard interior door leaf
  window: 1.2,      // ~4 ft typical window opening
  wall: 0.15,       // ~6 in interior partition thickness
  stair: 0.28,      // ~11 in typical tread depth
  fixture: 0.6096, // 24 in standard kitchen base-cabinet depth
  room: null,       // rooms vary too much to calibrate from
};

function polygonShortSideNorm(poly: Array<[number, number]>): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return Math.min(maxX - minX, maxY - minY);
}

function polygonToPoints(poly: Array<[number, number]>, w: number, h: number): string {
  return poly.map(([x, y]) => `${(x * w).toFixed(1)},${(y * h).toFixed(1)}`).join(" ");
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
  const detect = useServerFn(detectFloorElements);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [busyReplan, setBusyReplan] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [activeIndex, setActiveIndex] = useState<number>(floors[0]?.index ?? 0);
  const [progressLog, setProgressLog] = useState<string[]>([]);
  const [paintCategory, setPaintCategory] = useState<DetectedCategory | null>(null);

  function pushLog(line: string) {
    setProgressLog((prev) => [...prev, line]);
  }

  const activeFloor = floors.find((f) => f.index === activeIndex) ?? floors[0];
  const activeDetection = activeFloor ? detections[activeFloor.index] : undefined;

  const totalDetected = useMemo(
    () => Object.values(detections).reduce((sum, d) => sum + (d?.elements.length ?? 0), 0),
    [detections],
  );

  async function runDetect(floor: FloorPlanInput) {
    setError("");
    setBusyIndex(floor.index);
    try {
      // Step 1 — strip ALL text, dimensions and clutter; redraw as pure black
      // outlines on white so detection only sees the geometry the user will paint.
      let cleanedUrl = detections[floor.index]?.replannedDataUrl ?? "";
      if (!cleanedUrl) {
        pushLog(`${floor.label}: erasing every letter, number, dimension line and callout…`);
        const cleanPrompt = `Redraw this floor plan as a CLEAN PURE-BLACK-OUTLINE-ON-WHITE technical drawing.\n\nABSOLUTE RULES — these are non-negotiable:\n- DELETE every letter, number, word, label, room name, dimension, measurement, leader line, arrow, tick mark, scale bar, north arrow, callout, legend, title block, stamp, signature, sheet number, hatching, shading, color and texture. There must be ZERO TEXT and ZERO NUMBERS anywhere in the output.\n- Keep ONLY the geometric line work: walls, door openings (with swing arcs), window openings, stair treads, and fixed fixtures (toilets, sinks, tubs, counters, stoves).\n- Render as pure 1-pixel-to-3-pixel black ink lines on a 100% pure white background. No greys, no fills, no gradients, no shadows.\n- Preserve the EXACT outline, proportions, room positions and opening positions of the source.\n- Top-down orthographic 2D view. No perspective. No 3D.\n\nThe output is a clean black-outline floor plan ready for an algorithm to paint each enclosed region.`;
        await streamImage(cleanPrompt, floor.imageDataUrl, (src, isFinal) => {
          if (isFinal) cleanedUrl = src;
        });
        if (!cleanedUrl) throw new Error("Could not strip text from the drawing.");
        pushLog(`${floor.label}: text removed — only black outlines remain.`);
      }
      // Step 2 — detect closed shapes against the cleaned, text-free outline.
      pushLog(`${floor.label}: tracing every enclosed black shape as a selectable region.`);
      const res = await detect({ data: { imageDataUrl: cleanedUrl, label: floor.label } });
      if (!res.ok) { setError(res.error); return; }
      pushLog(`${floor.label}: ${res.elements.length} enclosed shape${res.elements.length === 1 ? "" : "s"} ready — tap any shape to paint it with a legend color.`);
      onDetectionsChange({
        ...detections,
        [floor.index]: {
          elements: res.elements,
          hidden: {},
          colors: { ...DEFAULT_COLORS, ...(detections[floor.index]?.colors ?? {}) },
          replannedDataUrl: cleanedUrl,
        },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Detection failed.");
    } finally {
      setBusyIndex(null);
    }
  }

  async function runDetectAll() {
    setProgressLog([]);
    const ordered = [...floors].sort((a, b) => a.index - b.index);
    for (const f of ordered) {
      setActiveIndex(f.index);
      pushLog(`Reading ${f.label}: ignoring all white space, keeping only black lines.`);
      // eslint-disable-next-line no-await-in-loop
      await runDetect(f);
    }
    pushLog("All floors processed. Pick a legend color, then tap any shape to paint it.");
  }

  async function replan(floor: FloorPlanInput) {
    const det = detections[floor.index];
    if (!det) return;
    setError("");
    setBusyReplan(floor.index);
    try {
      const summary = CATEGORY_ORDER.map((cat) => {
        const items = det.elements.filter((e) => e.category === cat && !det.hidden[e.id]);
        if (!items.length) return null;
        return `${CATEGORY_LABEL[cat]}: ${items.map((i) => i.label).slice(0, 12).join(", ")}`;
      }).filter(Boolean).join(" · ");
      const prompt = `Redraw this messy floor plan as a CLEAN, SIMPLIFIED, top-down 2D architectural floor plan in crisp black-on-white drafting style. Keep the SAME overall outline, same rooms in the same locations, same door/window positions and same proportions as the source image, but remove clutter, smudges, scan noise, hatching, dimension lines, callouts and text. Use thick black walls, thin black openings (doors with swing arcs, windows as double-line breaks in walls), and label each room in a small clean sans-serif uppercase tag at its centroid. 2D floor plan, orthographic top view, no perspective, no shadows, no color fills, pure black ink on pure white background, architectural drafting line weights. The drawing already contains: ${summary || "rooms, walls, doors, windows"}.`;
      let finalUrl = "";
      await streamImage(prompt, floor.imageDataUrl, (src, isFinal) => {
        if (isFinal) finalUrl = src;
      });
      if (!finalUrl) throw new Error("Replan returned no image.");
      onDetectionsChange({
        ...detections,
        [floor.index]: { ...det, replannedDataUrl: finalUrl },
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Replan failed.");
    } finally {
      setBusyReplan(null);
    }
  }

  function toggleHidden(elementId: string) {
    if (!activeFloor || !activeDetection) return;
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: {
        ...activeDetection,
        hidden: { ...activeDetection.hidden, [elementId]: !activeDetection.hidden[elementId] },
      },
    });
  }

  function toggleCategory(cat: DetectedCategory) {
    if (!activeFloor || !activeDetection) return;
    const ids = activeDetection.elements.filter((e) => e.category === cat).map((e) => e.id);
    const anyVisible = ids.some((id) => !activeDetection.hidden[id]);
    const next = { ...activeDetection.hidden };
    for (const id of ids) next[id] = anyVisible;
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: { ...activeDetection, hidden: next },
    });
  }

  function paintElement(elementId: string) {
    if (!activeFloor || !activeDetection || !paintCategory) return;
    const updatedElements = activeDetection.elements.map((el) => el.id === elementId ? { ...el, category: paintCategory } : el);
    let planWidthMeters = activeDetection.planWidthMeters;
    let calibration = activeDetection.calibration;
    const referenceMeters = REFERENCE_SHORT_SIDE_METERS[paintCategory];
    const painted = updatedElements.find((el) => el.id === elementId);
    if (referenceMeters && painted) {
      const shortSide = polygonShortSideNorm(painted.polygon);
      if (shortSide > 0.001) {
        // image normalized width = 1; plan real width (m) = referenceMeters / shortSide
        const inferred = referenceMeters / shortSide;
        // sanity clamp — most floor plans are 4 m – 60 m wide
        const clamped = Math.min(120, Math.max(2, inferred));
        planWidthMeters = clamped;
        calibration = { elementId, category: paintCategory, assumedMeters: referenceMeters };
        pushLog(`Calibrated from ${CATEGORY_LABEL[paintCategory].toLowerCase()} ≈ ${referenceMeters} m → plan is about ${clamped.toFixed(1)} m wide.`);
      }
    }
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: {
        ...activeDetection,
        elements: updatedElements,
        planWidthMeters,
        calibration,
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
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Step · Detect &amp; review elements</p>
        <p className="mt-1 text-xs text-muted-foreground">
          AI scans every floor plan and outlines walls, doors, windows, stairs, rooms and fixtures.
          Toggle, recolor or replan each floor before building the 3D model.
        </p>
        {totalDetected > 0 && <p className="mt-1 text-[11px] font-medium">{totalDetected} element{totalDetected === 1 ? "" : "s"} detected across {Object.keys(detections).length} floor{Object.keys(detections).length === 1 ? "" : "s"}.</p>}
      </div>
      <Button type="button" size="sm" onClick={() => void runDetectAll()} disabled={busyIndex !== null || floors.length === 0}>
        {busyIndex !== null ? <LoaderCircle className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
        {Object.keys(detections).length === 0 ? "Auto-detect all" : "Re-detect all"}
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
      <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/40">
        <div className="relative">
          <img src={displayUrl} alt={activeFloor.label} className="block w-full" />
          {activeDetection && <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className={`absolute inset-0 size-full ${paintCategory ? "" : "pointer-events-none"}`}
          >
            {activeDetection.elements.map((el) => {
              if (activeDetection.hidden[el.id]) return null;
              const fill = colors[el.category];
              const isRoom = el.category === "room";
              return <polygon
                key={el.id}
                points={polygonToPoints(el.polygon, 1000, 1000)}
                fill={fill}
                fillOpacity={isRoom ? 0.18 : 0.55}
                stroke={fill}
                strokeOpacity={0.85}
                strokeWidth={isRoom ? 1 : 1.6}
                onClick={paintCategory ? () => paintElement(el.id) : undefined}
                style={paintCategory ? { cursor: "pointer" } : undefined}
              />;
            })}
          </svg>}
        </div>
        {!activeDetection && <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm">
          <Button type="button" size="sm" onClick={() => void runDetect(activeFloor)} disabled={busyIndex !== null}>
            {busyIndex === activeFloor.index ? <LoaderCircle className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            Auto-detect this floor
          </Button>
        </div>}
        {busyIndex === activeFloor.index && <div className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-sm">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]"><LoaderCircle className="size-3 animate-spin" />Detecting…</p>
        </div>}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Legend · tap to pick paint color</p>
          {paintCategory && <p className="mt-1 text-[10px] text-foreground/80 inline-flex items-center gap-1"><Paintbrush className="size-3" />Painting <span className="font-semibold">{CATEGORY_LABEL[paintCategory]}</span> · tap a shape to apply. <button type="button" className="underline" onClick={() => setPaintCategory(null)}>Stop</button></p>}
          {activeDetection?.planWidthMeters && activeDetection?.calibration && <p className="mt-1 text-[10px] text-foreground/80">Scale locked: {CATEGORY_LABEL[activeDetection.calibration.category].toLowerCase()} ≈ {activeDetection.calibration.assumedMeters} m → plan ≈ <span className="font-semibold">{activeDetection.planWidthMeters.toFixed(1)} m</span> wide.</p>}
          <ul className="mt-2 space-y-1.5">
            {CATEGORY_ORDER.map((cat) => {
              const count = activeDetection?.elements.filter((e) => e.category === cat).length ?? 0;
              const visibleCount = activeDetection?.elements.filter((e) => e.category === cat && !activeDetection.hidden[e.id]).length ?? 0;
              const allHidden = count > 0 && visibleCount === 0;
              const isPainting = paintCategory === cat;
              return <li key={cat} className={`flex items-center gap-2 rounded-md px-1 py-0.5 text-[11px] ${isPainting ? "bg-foreground/5 ring-1 ring-foreground/30" : ""}`}>
                <input
                  type="color"
                  value={colors[cat]}
                  onChange={(e) => setCategoryColor(cat, e.target.value)}
                  className="size-4 cursor-pointer rounded border border-border bg-transparent disabled:cursor-not-allowed"
                  aria-label={`${CATEGORY_LABEL[cat]} color`}
                />
                <button
                  type="button"
                  className="flex-1 text-left hover:underline"
                  onClick={() => setPaintCategory(isPainting ? null : cat)}
                >{CATEGORY_LABEL[cat]}</button>
                <span className="tabular-nums text-muted-foreground">{count}</span>
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  disabled={count === 0}
                  className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label={allHidden ? `Show ${CATEGORY_LABEL[cat]}` : `Hide ${CATEGORY_LABEL[cat]}`}
                >
                  {allHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
              </li>;
            })}
          </ul>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => void replan(activeFloor)} disabled={!activeDetection || busyReplan !== null}>
            {busyReplan === activeFloor.index ? <LoaderCircle className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
            {activeDetection?.replannedDataUrl ? "Re-replan with AI" : "Replan with AI"}
          </Button>
          {activeDetection?.replannedDataUrl && <Button
            type="button"
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => {
              if (!activeDetection) return;
              const { replannedDataUrl: _replanned, ...rest } = activeDetection;
              void _replanned;
              onDetectionsChange({ ...detections, [activeFloor.index]: rest });
            }}
          >Use original drawing</Button>}
        </div>
      </div>
    </div>}
  </div>;
}