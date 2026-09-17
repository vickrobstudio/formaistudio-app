import { useEffect, useMemo, useRef, useState } from "react";
import { alignPlanToInk } from "@/lib/plan-alignment";
import { calibratePlan, type PlanPoint } from "@/lib/plan-calibration";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, MousePointer2, PenLine, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { detectFloorElements, MARK_LIFT_SPECS, MARK_LIFT_TYPES, type MarkLiftType } from "@/lib/floor-3d.functions";

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
  calibration?: { points: [PlanPoint, PlanPoint]; distance: number; units: "meters" | "feet" };
};

type Tool = "select" | "draw" | "delete" | "measure";

type Props = {
  imageDataUrl: string;
  initialResult?: AnnotatorResult;
  defaultPlanWidth?: number;
  onClose: () => void;
  onApply: (result: AnnotatorResult) => void;
};

function ratio(s: AnnotatorResult | null) {
  if (!s) return 1;
  return s.imageWidth / Math.max(1, s.imageHeight);
}

export function FloorAnnotator({ imageDataUrl, initialResult, defaultPlanWidth = 12, onClose, onApply }: Props) {
  const detectFn = useServerFn(detectFloorElements);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [imageWidth, setImageWidth] = useState(initialResult?.imageWidth ?? 0);
  const [imageHeight, setImageHeight] = useState(initialResult?.imageHeight ?? 0);
  const [polygons, setPolygons] = useState<AnnotatedPolygon[]>(initialResult?.polygons ?? []);
  const [activeType, setActiveType] = useState<MarkLiftType>("wall");
  const [tool, setTool] = useState<Tool>("select");
  const [drawingPoints, setDrawingPoints] = useState<Array<[number, number]>>([]);
  const [planWidth, setPlanWidth] = useState(initialResult?.planWidthMeters ?? defaultPlanWidth);
  const [measurePoints, setMeasurePoints] = useState<PlanPoint[]>(initialResult?.calibration?.points ?? []);
  const [distance, setDistance] = useState(String(initialResult?.calibration?.distance ?? ""));
  const [units, setUnits] = useState<"meters" | "feet">(initialResult?.calibration?.units ?? "meters");
  const [calibration, setCalibration] = useState(initialResult?.calibration);
  const [scaleConfirmed, setScaleConfirmed] = useState(!!initialResult?.calibration);
  const [alignmentBackup, setAlignmentBackup] = useState<AnnotatedPolygon[] | null>(null);
  const [alignmentMessage, setAlignmentMessage] = useState("");
  const [busy, setBusy] = useState<"" | "detect" | "align">("");
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

  async function alignOutlines(source: AnnotatedPolygon[]) {
    const img = new Image();
    img.src = imageDataUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Unable to read the drawing for alignment.");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const ink = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < ink.length; i++) {
      const luminance = .2126 * pixels[i * 4] + .7152 * pixels[i * 4 + 1] + .0722 * pixels[i * 4 + 2];
      ink[i] = Math.max(0, Math.min(255, (190 - luminance) * 2));
    }
    const result = alignPlanToInk(source, ink, canvas.width, canvas.height);
    setAlignmentBackup(result.changed ? source : null);
    setAlignmentMessage(result.changed ? "Alignment adjusted to the drawing. Inspect every region; undo if needed." : "No reliable alignment adjustment found. Inspect and redraw any incorrect regions.");
    return result.polygons;
  }

  async function runAlignment() {
    setBusy("align"); setError("");
    try { setPolygons(await alignOutlines(polygons)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to align the drawing."); }
    finally { setBusy(""); }
  }

  async function runDetect() {
    if (!imageWidth || !imageHeight) return;
    setBusy("detect"); setError("");
    try {
      const result = await detectFn({ data: { imageDataUrl, imageWidth, imageHeight } });
      if (!result.ok) { setError(result.error); return; }
      // Replace AI results but keep any manual additions the user already drew.
      const manual = polygons.filter((p) => p.id.startsWith("man_"));
      const ai = result.polygons.map((p, i) => ({
        id: `det_${Date.now()}_${i}`,
        type: p.type as MarkLiftType,
        points: p.points as Array<[number, number]>,
      }));
      const detected = [...manual, ...ai];
      setPolygons(detected);
      try { setPolygons(await alignOutlines(detected)); }
      catch { setAlignmentMessage("Automatic alignment unavailable. Review the detected regions manually."); }
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
    if (tool !== "draw" && tool !== "measure") return;
    const p = svgToNorm(evt);
    if (!p) return;
    if (tool === "measure") {
      setMeasurePoints((prev) => prev.length === 2 ? [p] : [...prev, p]);
      setScaleConfirmed(false); setCalibration(undefined);
      return;
    }
    setDrawingPoints((prev) => [...prev, p]);
  }

  function finishDraw() {
    setAlignmentBackup(null);
    if (drawingPoints.length < 3) { setDrawingPoints([]); return; }
    setPolygons((prev) => [...prev, {
      id: `man_${Date.now()}`,
      type: activeType,
      points: drawingPoints,
    }]);
    setDrawingPoints([]);
  }

  function onPolyClick(id: string) {
    setAlignmentBackup(null);
    if (tool === "delete") {
      setPolygons((prev) => prev.filter((p) => p.id !== id));
      return;
    }
    if (tool === "select") {
      setPolygons((prev) => prev.map((p) => p.id === id ? { ...p, type: activeType } : p));
    }
  }

  const previewRatio = imageWidth && imageHeight ? imageWidth / imageHeight : 1.6;

  function confirmMeasurement() {
    try {
      if (measurePoints.length !== 2) throw new Error("Select both ends of a known dimension on the plan.");
      const points = measurePoints as [PlanPoint, PlanPoint];
      const result = calibratePlan(points[0], points[1], imageWidth, imageHeight, Number(distance), units);
      setPlanWidth(result.planWidthMeters);
      setCalibration({ points, distance: Number(distance), units });
      setScaleConfirmed(true); setTool("select"); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to calibrate scale."); }
  }

  function apply() {
    if (!imageWidth || !imageHeight) return;
    if (polygons.length === 0) { setError("Add at least one element before lifting."); return; }
    if (!scaleConfirmed || !Number.isFinite(planWidth) || planWidth <= 0) { setError("Calibrate the plan using a known distance before continuing."); return; }
    onApply({ imageWidth, imageHeight, planWidthMeters: planWidth, polygons, calibration });
  }

  const counts = useMemo(() => {
    const m: Record<MarkLiftType, number> = { wall: 0, door: 0, window: 0, floor: 0, roof: 0, fixture: 0 };
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
              style={{ cursor: (tool === "draw" || tool === "measure") ? "crosshair" : tool === "delete" ? "not-allowed" : "pointer" }}
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
                    onClick={(e) => { if (tool === "draw" || tool === "measure") return; e.stopPropagation(); onPolyClick(poly.id); }}
                  />
                );
              })}
              {measurePoints.length > 0 && <g pointerEvents="none">
                {measurePoints.length === 2 && <line x1={measurePoints[0][0]} y1={measurePoints[0][1]} x2={measurePoints[1][0]} y2={measurePoints[1][1]} stroke="#0057ff" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
                {measurePoints.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.009} fill="#0057ff" stroke="white" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
              </g>}
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

          <Button onClick={runDetect} disabled={busy !== "" || !imageWidth} className="rounded-full">
            {busy === "detect" ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            {polygons.length ? "Re-detect elements" : "Auto-detect elements"}
          </Button>

          {polygons.length > 0 && <Button variant="outline" onClick={runAlignment} disabled={busy !== ""}>Align detected regions to drawing</Button>}
          {alignmentMessage && <p className="text-xs text-neutral-600" role="status">{alignmentMessage}</p>}
          {alignmentBackup && <Button variant="outline" onClick={() => { setPolygons(alignmentBackup); setAlignmentBackup(null); setAlignmentMessage("Alignment undone."); }}>Undo alignment</Button>}
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
                  <span className="text-xs text-neutral-500">{spec.height.toFixed(2)} m × {counts[t]}</span>
                </button>
              );
            })}
            <p className="pt-1 text-[11px] text-neutral-500">
              Tip: pick a color above, then click a region to reassign it. Use Draw to add anything the AI missed.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">Calibrate with a known distance</h3>
            <p className="text-xs text-neutral-600">Select the two ends of a dimension on the original plan, then enter its real length. Include only the measured span, not the image margins.</p>
            <Button variant="outline" onClick={() => { setTool("measure"); setMeasurePoints([]); setScaleConfirmed(false); setCalibration(undefined); }}>
              Select two measurement points
            </Button>
            <p className="text-xs" role="status">{measurePoints.length}/2 points selected</p>
            <label htmlFor="known-distance" className="text-xs">Known distance</label>
            <div className="flex gap-2">
              <Input id="known-distance" type="number" min="0.001" step="any" value={distance} onChange={(e) => { setDistance(e.target.value); setScaleConfirmed(false); setCalibration(undefined); }} />
              <select aria-label="Measurement units" value={units} onChange={(e) => { setUnits(e.target.value as "meters" | "feet"); setScaleConfirmed(false); setCalibration(undefined); }} className="rounded border px-2">
                <option value="meters">Meters</option><option value="feet">Feet</option>
              </select>
            </div>
            <Button onClick={confirmMeasurement} disabled={measurePoints.length !== 2}>Apply measured scale</Button>
            {scaleConfirmed && <p className="text-xs text-green-800" role="status">Scale calibrated. Full image longest side: {planWidth.toFixed(3)} m.</p>}
          </div>

          <div className="mt-auto flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-full">Cancel</Button>
            <Button onClick={apply} disabled={!scaleConfirmed || busy !== ""} className="flex-1 rounded-full">Confirm 2D parts and scale</Button>
          </div>
        </div>
      </div>
    </div>
  );
}