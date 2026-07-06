import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, MousePointer2, PenLine, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { detectFloorElements, MARK_LIFT_SPECS, MARK_LIFT_TYPES, type MarkLiftType } from "@/lib/floor-3d.functions";
import { extractPlanShapes, pointInPolygon } from "@/lib/image-plan-shapes";

export type AnnotatedPolygon = {
  id: string;
  type: MarkLiftType;
  // Normalised 0..1 image coordinates (origin top-left).
  points: Array<[number, number]>;
};

export type AnnotatorResult = {
  imageWidth: number;
  imageHeight: number;
  planWidthMeters: number;
  polygons: AnnotatedPolygon[];
};

type Tool = "select" | "draw" | "delete";

type Props = {
  imageDataUrl: string;
  initialResult?: AnnotatorResult;
  defaultPlanWidth?: number;
  /** Display unit for the plan-scale field; stored value stays meters. */
  planUnits?: "feet-inches" | "meters";
  onClose: () => void;
  onApply: (result: AnnotatorResult) => void;
};

function ratio(s: AnnotatorResult | null) {
  if (!s) return 1;
  return s.imageWidth / Math.max(1, s.imageHeight);
}

export function FloorAnnotator({ imageDataUrl, initialResult, defaultPlanWidth = 12, planUnits = "meters", onClose, onApply }: Props) {
  const isFeet = planUnits === "feet-inches";
  const metersToDisplay = (m: number) => (isFeet ? Math.round((m / 0.3048) * 10) / 10 : m);
  const displayToMeters = (v: number) => (isFeet ? v * 0.3048 : v);
  const detectFn = useServerFn(detectFloorElements);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [imageWidth, setImageWidth] = useState(initialResult?.imageWidth ?? 0);
  const [imageHeight, setImageHeight] = useState(initialResult?.imageHeight ?? 0);
  const [polygons, setPolygons] = useState<AnnotatedPolygon[]>(initialResult?.polygons ?? []);
  const [activeType, setActiveType] = useState<MarkLiftType>("wall");
  const [tool, setTool] = useState<Tool>("select");
  const [drawingPoints, setDrawingPoints] = useState<Array<[number, number]>>([]);
  const [planWidth, setPlanWidth] = useState(metersToDisplay(initialResult?.planWidthMeters ?? defaultPlanWidth));
  const [busy, setBusy] = useState<"" | "detect">("");
  const [error, setError] = useState("");

  // Measure the natural size of the uploaded image once.
  useEffect(() => {
    if (imageWidth && imageHeight) return;
    const img = new Image();
    img.onload = () => {
      setImageWidth(img.naturalWidth || img.width);
      setImageHeight(img.naturalHeight || img.height);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, imageWidth, imageHeight]);

  async function runDetect() {
    if (!imageWidth || !imageHeight) return;
    setBusy("detect"); setError("");
    try {
      // Walls and floors come from deterministic shape tracing — enclosed
      // regions of the black linework itself, so geometry hugs the plan.
      // The AI supplies the semantic extras (doors, windows, stairs, …).
      const [shapes, result, tiled] = await Promise.all([
        extractPlanShapes(imageDataUrl).catch(() => null),
        detectFn({ data: { imageDataUrl, imageWidth, imageHeight } }).catch(() => null),
        import("@/lib/tiled-openings").then((m) => m.detectOpeningsTiled(imageDataUrl, (input) => detectFn(input))).catch(() => []),
      ]);
      const manual = polygons.filter((p) => p.id.startsWith("man_"));
      const ai = (result && result.ok ? result.polygons : []).map((p, i) => ({
        id: `det_${Date.now()}_${i}`,
        type: p.type as MarkLiftType,
        points: p.points as Array<[number, number]>,
      }));
      // Same arbitration as the main flow: keep regions with a printed room
      // label inside or a firmly wall-bounded outline.
      const labels = result && result.ok ? (result.roomLabels ?? []) : [];
      const OUTDOOR_LABEL = /\b(pool|spa|sun\s?deck|deck|planter|port\s?cochere|driveway|patio|terrace|garden|yard|equipment)\b/i;
      const keptIndex = new Set(
        (shapes?.rooms ?? [])
          .filter((room) => {
            const label = labels.find((l) => pointInPolygon(l.at[0], l.at[1], room.points));
            if (label && !OUTDOOR_LABEL.test(label.name)) return true;
            return room.wallScore >= 0.7 && room.textScore < 0.06 && !(label && OUTDOOR_LABEL.test(label.name));
          })
          .map((room) => room.index),
      );
      const traced = (shapes?.polygons ?? [])
        .filter((p) => {
          const m = p.id.match(/^shape_(?:floor|wall|door|window)_(\d+)/);
          return !m || keptIndex.has(Number(m[1]));
        })
        .map((p) => ({ id: p.id, type: p.type as MarkLiftType, points: p.points }));
      const tiledOpenings = tiled.map((p, i) => ({
        id: `tile_${Date.now()}_${i}`,
        type: p.type as MarkLiftType,
        points: p.points,
      }));
      const useTraced = traced.some((p) => p.type === "floor");
      const merged = useTraced
        ? [...traced, ...tiledOpenings, ...ai.filter((p) => p.type !== "wall" && p.type !== "floor")]
        : [...ai, ...tiledOpenings];
      if (!merged.length) {
        setError(result && !result.ok ? result.error : "No enclosed shapes found — draw the outline manually or try a sharper image.");
        return;
      }
      setPolygons([...manual, ...merged]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Detection failed.");
    } finally {
      setBusy("");
    }
  }

  function svgToNorm(evt: React.MouseEvent<SVGSVGElement>): [number, number] | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = (evt.clientX - rect.left) / rect.width;
    const y = (evt.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return [x, y];
  }

  function onSvgClick(evt: React.MouseEvent<SVGSVGElement>) {
    if (tool !== "draw") return;
    const p = svgToNorm(evt);
    if (!p) return;
    setDrawingPoints((prev) => [...prev, p]);
  }

  function finishDraw() {
    if (drawingPoints.length < 3) { setDrawingPoints([]); return; }
    setPolygons((prev) => [...prev, {
      id: `man_${Date.now()}`,
      type: activeType,
      points: drawingPoints,
    }]);
    setDrawingPoints([]);
  }

  function onPolyClick(id: string) {
    if (tool === "delete") {
      setPolygons((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    if (tool === "select") {
      setPolygons((prev) => prev.map((p) => p.id === id ? { ...p, type: activeType } : p));
    }
  }

  const previewRatio = imageWidth && imageHeight ? imageWidth / imageHeight : 1.6;

  function apply() {
    if (!imageWidth || !imageHeight) return;
    if (polygons.length === 0) { setError("Add at least one element before lifting."); return; }
    onApply({ imageWidth, imageHeight, planWidthMeters: displayToMeters(planWidth), polygons });
  }

  const counts = useMemo(() => {
    const m = Object.fromEntries(MARK_LIFT_TYPES.map((t) => [t, 0])) as Record<MarkLiftType, number>;
    for (const p of polygons) m[p.type] += 1;
    return m;
  }, [polygons]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/80 backdrop-blur-sm">
      <div className="m-2 flex w-full max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white text-black md:m-6 md:flex-row">
        {/* Canvas */}
        <div className="relative flex-1 overflow-auto bg-neutral-100 p-3">
          <div ref={wrapRef} className="relative mx-auto" style={{ maxWidth: 1080, width: "100%", aspectRatio: String(previewRatio) }}>
            <img src={imageDataUrl} alt="floor plan" className="absolute inset-0 h-full w-full select-none object-contain" draggable={false} />
            <svg
              ref={svgRef}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              onClick={onSvgClick}
              style={{ cursor: tool === "draw" ? "crosshair" : tool === "delete" ? "not-allowed" : "pointer" }}
            >
              {polygons.map((poly) => {
                const spec = MARK_LIFT_SPECS[poly.type];
                const pts = poly.points.map(([x, y]) => `${x},${y}`).join(" ");
                return (
                  <polygon
                    key={poly.id}
                    points={pts}
                    fill={spec.hex}
                    fillOpacity={0.45}
                    stroke={spec.hex}
                    strokeOpacity={0.95}
                    strokeWidth={0.003}
                    vectorEffect="non-scaling-stroke"
                    onClick={(e) => { e.stopPropagation(); onPolyClick(poly.id); }}
                  />
                );
              })}
              {drawingPoints.length > 0 && (
                <polyline
                  points={drawingPoints.map(([x, y]) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={MARK_LIFT_SPECS[activeType].hex}
                  strokeWidth={0.004}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {drawingPoints.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={0.006} fill={MARK_LIFT_SPECS[activeType].hex} />
              ))}
            </svg>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-neutral-200 p-4 md:w-[340px] md:border-l md:border-t-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Mark & lift</h2>
              <p className="mt-1 text-xs text-neutral-600">Auto-detect elements, then recolor or draw to fix anything the AI missed.</p>
            </div>
            <button onClick={onClose} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
          </div>

          <Button onClick={runDetect} disabled={busy === "detect" || !imageWidth} className="rounded-full">
            {busy === "detect" ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {polygons.length ? "Re-detect elements" : "Auto-detect elements"}
          </Button>

          {error ? <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

          {/* Tools */}
          <div className="flex gap-1 rounded-full bg-neutral-100 p-1 text-xs">
            <button onClick={() => setTool("select")} className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 ${tool === "select" ? "bg-white shadow" : "text-neutral-600"}`}>
              <MousePointer2 className="h-3 w-3" /> Recolor
            </button>
            <button onClick={() => setTool("draw")} className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 ${tool === "draw" ? "bg-white shadow" : "text-neutral-600"}`}>
              <PenLine className="h-3 w-3" /> Draw
            </button>
            <button onClick={() => setTool("delete")} className={`flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 ${tool === "delete" ? "bg-white shadow" : "text-neutral-600"}`}>
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
          {tool === "draw" ? (
            <div className="flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span>{drawingPoints.length} pts placed</span>
              <div className="flex gap-1">
                <button className="rounded bg-white px-2 py-0.5" onClick={() => setDrawingPoints([])}>Clear</button>
                <button className="rounded bg-amber-700 px-2 py-0.5 text-white" onClick={finishDraw}>Finish polygon</button>
              </div>
            </div>
          ) : null}

          {/* Palette */}
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Element palette</div>
            {MARK_LIFT_TYPES.map((t) => {
              const spec = MARK_LIFT_SPECS[t];
              const active = activeType === t;
              return (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-sm ${active ? "border-black bg-neutral-50" : "border-transparent hover:bg-neutral-50"}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded" style={{ background: spec.hex }} />
                    <span className="font-medium">{spec.label}</span>
                  </span>
                  <span className="text-xs text-neutral-500">{isFeet ? `${(spec.height / 0.3048).toFixed(1)} ft` : `${spec.height.toFixed(2)} m`} × {counts[t]}</span>
                </button>
              );
            })}
            <p className="pt-1 text-[11px] text-neutral-500">
              Tip: pick a color above, then click a region to reassign it. Use Draw to add anything the AI missed.
            </p>
          </div>

          {/* Scale */}
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Plan scale</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min="1"
                value={planWidth}
                onChange={(e) => setPlanWidth(Math.max(1, Number(e.target.value) || metersToDisplay(defaultPlanWidth)))}
                className="h-9"
              />
              <span className="text-xs text-neutral-600 whitespace-nowrap">{isFeet ? "ft" : "m"} on longest side</span>
            </div>
          </div>

          <div className="mt-auto flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-full">Cancel</Button>
            <Button onClick={apply} className="flex-1 rounded-full">Lift to 3D</Button>
          </div>
        </div>
      </div>
    </div>
  );
}