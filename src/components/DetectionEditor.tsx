import { useMemo, useState } from "react";
import { Eye, EyeOff, LoaderCircle, Sparkles, Wand2 } from "lucide-react";
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
      pushLog(`${floor.label}: small enclosed shapes → walls, narrow gaps in walls → doors & windows.`);
      const res = await detect({ data: { imageDataUrl: floor.imageDataUrl, label: floor.label } });
      if (!res.ok) { setError(res.error); return; }
      const counts = res.elements.reduce<Record<string, number>>((acc, el) => {
        acc[el.category] = (acc[el.category] ?? 0) + 1;
        return acc;
      }, {});
      pushLog(`${floor.label}: open enclosed areas → rooms. Found ${Object.entries(counts).map(([k, v]) => `${v} ${k}${v === 1 ? "" : "s"}`).join(", ") || "no elements"}.`);
      onDetectionsChange({
        ...detections,
        [floor.index]: {
          elements: res.elements,
          hidden: {},
          colors: { ...DEFAULT_COLORS, ...(detections[floor.index]?.colors ?? {}) },
          replannedDataUrl: detections[floor.index]?.replannedDataUrl,
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
      pushLog(`Reading ${f.label}: tracing every closed black-line shape on the plan…`);
      // eslint-disable-next-line no-await-in-loop
      await runDetect(f);
    }
    pushLog("All floors processed. Review, recolor or replan before building the 3D model.");
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

    {activeFloor && <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_240px]">
      <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/40">
        <div className="relative">
          <img src={displayUrl} alt={activeFloor.label} className="block w-full" />
          {activeDetection && <svg
            viewBox="0 0 1000 1000"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full"
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
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Legend</p>
          <ul className="mt-2 space-y-1.5">
            {CATEGORY_ORDER.map((cat) => {
              const count = activeDetection?.elements.filter((e) => e.category === cat).length ?? 0;
              const visibleCount = activeDetection?.elements.filter((e) => e.category === cat && !activeDetection.hidden[e.id]).length ?? 0;
              const allHidden = count > 0 && visibleCount === 0;
              return <li key={cat} className="flex items-center gap-2 text-[11px]">
                <input
                  type="color"
                  value={colors[cat]}
                  onChange={(e) => setCategoryColor(cat, e.target.value)}
                  disabled={count === 0}
                  className="size-4 cursor-pointer rounded border border-border bg-transparent disabled:cursor-not-allowed"
                  aria-label={`${CATEGORY_LABEL[cat]} color`}
                />
                <span className="flex-1">{CATEGORY_LABEL[cat]}</span>
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

        {activeDetection && activeDetection.elements.length > 0 && <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Elements</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {activeDetection.elements.map((el) => {
              const hidden = activeDetection.hidden[el.id];
              return <li key={el.id} className="flex items-center gap-2 text-[11px]">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colors[el.category] }} />
                <span className={`flex-1 truncate ${hidden ? "line-through opacity-40" : ""}`}>{el.label}</span>
                <button
                  type="button"
                  onClick={() => toggleHidden(el.id)}
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={hidden ? "Show element" : "Hide element"}
                >{hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}</button>
              </li>;
            })}
          </ul>
        </div>}

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