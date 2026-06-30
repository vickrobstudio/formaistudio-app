import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Maximize2, MousePointer2, Move, Paintbrush, Redo2, Sparkles, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DetectedCategory, DetectedElement } from "@/lib/floor-detect.functions";
import { extractRoomRegions, buildClassifierThumbnail, closeOpenings } from "@/lib/floor-pipeline";
import { classifyFloorRegions } from "@/lib/floor-classify.functions";

// pdf.js + tesseract.js are loaded lazily inside prepare() so they don't
// inflate the initial bundle and never run on the server.

export type FloorPlanInput = {
  index: number;
  label: string;
  imageDataUrl: string;
};

export type FloorDetection = {
  elements: DetectedElement[];
  hidden: Record<string, boolean>;
  colors: Partial<Record<DetectedCategory, string>>;
  /** Per-element color override (overrides the category color). */
  fills?: Record<string, string>;
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
 * Render the first page of a PDF (as a data URL) into a high-resolution
 * canvas using pdf.js. Returns the canvas plus its pixel dimensions.
 */
async function renderPdfToCanvas(dataUrl: string, targetLongSide = 3400): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const pdfjs = await import("pdfjs-dist");
  // Worker via Vite ?url import — bundles a hashed URL to the worker chunk.
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetLongSide / Math.max(baseViewport.width, baseViewport.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context to render PDF.");
  // White background so OCR + transparency pass behave predictably.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return { canvas, width: canvas.width, height: canvas.height };
}

/**
 * Load a raster image (jpg / png) into a canvas at up to 2200 px on the
 * long side so OCR and paint behave the same as for rendered PDFs.
 */
async function rasterImageToCanvas(dataUrl: string, targetLongSide = 2200): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("Could not load image")); img.src = dataUrl; });
  const scale = Math.min(1, targetLongSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context.");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

/**
 * OCR-detect every text/number block in the rendered drawing and paint a
 * solid white rectangle over each one (with a small pad), erasing labels and
 * dimensions while leaving the black vector linework untouched.
 */
async function eraseTextOnCanvas(canvas: HTMLCanvasElement, onProgress?: (pct: number) => void): Promise<number> {
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m) => { if (m.status === "recognizing text" && onProgress) onProgress(m.progress ?? 0); },
  });
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    ctx.fillStyle = "#ffffff";
    let erased = 0;
    type WordLike = { text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number }; confidence?: number };
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.words)) {
        for (const w of obj.words as WordLike[]) {
          const t = (w.text ?? "").trim();
          if (!t || !w.bbox) continue;
          if ((w.confidence ?? 0) < 35 && t.length < 2) continue;
          const pad = 3;
          const x = Math.max(0, w.bbox.x0 - pad);
          const y = Math.max(0, w.bbox.y0 - pad);
          const ww = Math.min(canvas.width - x, w.bbox.x1 - w.bbox.x0 + pad * 2);
          const hh = Math.min(canvas.height - y, w.bbox.y1 - w.bbox.y0 + pad * 2);
          if (ww > 0 && hh > 0) { ctx.fillRect(x, y, ww, hh); erased++; }
        }
      }
      if (Array.isArray(obj.blocks)) for (const b of obj.blocks) walk(b);
      if (Array.isArray(obj.paragraphs)) for (const p of obj.paragraphs) walk(p);
      if (Array.isArray(obj.lines)) for (const l of obj.lines) walk(l);
    };
    walk(data);
    return erased;
  } finally {
    await worker.terminate();
  }
}

/**
 * Convert a cleaned floor plan image into a transparent PNG: anything dark
 * (the line work) stays opaque black; everything light becomes fully
 * transparent. Returns { dataUrl, width, height, mask } where mask[i] is 1
 * for "line pixel", 0 for "transparent".
 */
async function whiteToTransparentFromSource(source: string | HTMLCanvasElement): Promise<{ dataUrl: string; width: number; height: number; mask: Uint8Array }> {
  let srcCanvas: HTMLCanvasElement;
  if (typeof source === "string") {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Could not load cleaned image"));
      img.src = source;
    });
    srcCanvas = document.createElement("canvas");
    srcCanvas.width = img.naturalWidth; srcCanvas.height = img.naturalHeight;
    srcCanvas.getContext("2d")!.drawImage(img, 0, 0);
  } else {
    srcCanvas = source;
  }
  // Cap working resolution so flood fill stays responsive while keeping
  // enough pixels for hairlines from CAD PDFs to survive.
  const MAX = 2600;
  const scale = Math.min(1, MAX / Math.max(srcCanvas.width, srcCanvas.height));
  const w = Math.max(1, Math.round(srcCanvas.width * scale));
  const h = Math.max(1, Math.round(srcCanvas.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.drawImage(srcCanvas, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data;
  // VECTOR-PRESERVING ALPHA KEY. The drawing is line art on a white page —
  // we only want to make the WHITE transparent. We do NOT threshold,
  // dilate, erode or otherwise rewrite the line work, because every one
  // of those passes breaks thin walls and leaves rooms un-enclosed.
  //
  // For each pixel: alpha = how far it is from pure white (luma 255).
  // The RGB stays exactly as drawn, so anti-aliased edges, hairlines,
  // grey shading and coloured strokes all survive untouched. A small
  // dead-zone near pure white kills paper texture / JPEG noise without
  // touching anything that reads as a line.
  // Binary alpha key: anything that isn't near-pure-white is a LINE and
  // stays fully opaque at its original RGB. Only true paper background
  // (luma ≥ 250) goes transparent. This preserves every hairline,
  // anti-aliased edge and faint grey stroke at full strength — the
  // previous ramp was fading them out and breaking thin walls.
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    if (luma >= 250) {
      data[i + 3] = 0;
    } else {
      data[i + 3] = 255;
      mask[p] = 1;
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

/**
 * Walk every background pixel of the line mask once and return every
 * enclosed region — i.e. every connected component of "empty" pixels that
 * does NOT touch the image edge. Each region is reported as a normalized
 * polygon (axis-aligned bounding box) plus its pixel list so callers can
 * paint it back on the canvas. Tiny regions and the giant outside region
 * are filtered out.
 */
function detectEnclosedRegions(
  mask: Uint8Array,
  w: number,
  h: number,
  opts: { minAreaPx?: number; maxRegions?: number } = {},
): Array<{ pixels: number[]; bbox: [number, number, number, number] }> {
  const minArea = opts.minAreaPx ?? Math.max(120, Math.round(w * h * 0.00015));
  const maxRegions = opts.maxRegions ?? 400;
  const visited = new Uint8Array(w * h);
  const regions: Array<{ pixels: number[]; bbox: [number, number, number, number] }> = [];
  for (let p = 0; p < mask.length; p++) {
    if (visited[p] || mask[p] === 1) continue;
    // Iterative 4-connected flood fill from this background pixel.
    const stack = [p];
    const pixels: number[] = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let touchedEdge = false;
    while (stack.length) {
      const q = stack.pop()!;
      if (visited[q]) continue;
      visited[q] = 1;
      if (mask[q] === 1) continue;
      pixels.push(q);
      const x = q % w, y = (q - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchedEdge = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0) stack.push(q - 1);
      if (x < w - 1) stack.push(q + 1);
      if (y > 0) stack.push(q - w);
      if (y < h - 1) stack.push(q + w);
    }
    if (touchedEdge) continue;          // skip the outside / unsealed regions
    if (pixels.length < minArea) continue; // skip noise specks
    regions.push({ pixels, bbox: [minX, minY, maxX, maxY] });
    if (regions.length >= maxRegions) break;
  }
  // Largest regions first — rooms tend to be the biggest enclosures.
  regions.sort((a, b) => b.pixels.length - a.pixels.length);
  return regions;
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
  const [zoom, setZoom] = useState<number>(1);
  // Editor tool: pick = hover/click to select an element;
  // paint = clicking an element re-colors it; move = drag an element to translate it.
  const [tool, setTool] = useState<"pick" | "paint" | "move">("pick");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; startX: number; startY: number; orig: Array<[number, number]> } | null>(null);

  // Per-floor cached working data: line mask + canvas refs + dimensions.
  const workingRef = useRef<Record<number, { width: number; height: number; mask: Uint8Array }>>({});
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Per-floor undo/redo history of detection snapshots.
  type Snap = Pick<FloorDetection, "elements" | "paintedDataUrl" | "planWidthMeters" | "calibration" | "fills">;
  const undoRef = useRef<Record<number, Snap[]>>({});
  const redoRef = useRef<Record<number, Snap[]>>({});
  const [historyTick, setHistoryTick] = useState(0);

  function snapshotOf(det: FloorDetection): Snap {
    return {
      elements: det.elements,
      paintedDataUrl: det.paintedDataUrl,
      planWidthMeters: det.planWidthMeters,
      calibration: det.calibration,
      fills: det.fills,
    };
  }

  function pushUndo(floorIndex: number, snap: Snap) {
    const stack = undoRef.current[floorIndex] ?? [];
    stack.push(snap);
    if (stack.length > 50) stack.shift();
    undoRef.current[floorIndex] = stack;
    redoRef.current[floorIndex] = []; // new action invalidates redo
    setHistoryTick((t) => t + 1);
  }

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
      let didFreshClean = false;
      if (!cleanedUrl) {
        // 1. Render the source (PDF vectors or raster image) at high DPI so
        //    no line work is lost — we keep the EXACT original vectors.
        const isPdf = floor.imageDataUrl.startsWith("data:application/pdf");
        pushLog(`${floor.label}: ${isPdf ? "rendering PDF vectors at high resolution" : "loading drawing"}…`);
        const { canvas } = isPdf
          ? await renderPdfToCanvas(floor.imageDataUrl)
          : await rasterImageToCanvas(floor.imageDataUrl);
        // Vector-preserving alpha key: keep every original line pixel
        // exactly as drawn, only knock out the white paper background.
        // No OCR erase, no thresholding, no morphology — those passes
        // were breaking thin walls and leaving rooms un-enclosed.
        pushLog(`${floor.label}: making paper transparent, preserving every line…`);
        const { dataUrl, width, height, mask } = await whiteToTransparentFromSource(canvas);
        cleanedUrl = dataUrl;
        workingRef.current[floor.index] = { width, height, mask };
        didFreshClean = true;
      } else if (!workingRef.current[floor.index]) {
        // Rebuild mask from saved cleaned image (after a refresh / first mount).
        const { width, height, mask } = await whiteToTransparentFromSource(cleanedUrl);
        workingRef.current[floor.index] = { width, height, mask };
      }
      // Auto-detect enclosed shapes from the line mask: every connected
      // background region that does NOT touch the image edge becomes a
      // shape candidate (default category "room"). We only run this when
      // the page was freshly cleaned and the user has no shapes yet, so
      // we never overwrite manual paint work.
      const existing = detections[floor.index]?.elements ?? [];
      let elements = existing;
      let paintedDataUrl = detections[floor.index]?.paintedDataUrl;
      const work = workingRef.current[floor.index];
      if (didFreshClean && existing.length === 0 && work) {
        // Pipeline step 6+7: flood-fill every enclosed region, then trace
        // each one as a real polygon (not a bounding box) via Moore-
        // neighbor contour + Douglas-Peucker simplification.
        // Step 2 — virtually close door openings so flood-fill can't leak
        // between rooms. Radius is proportional to the image size so the
        // same setting works across small and large plans.
        const closureRadius = Math.max(4, Math.round(Math.max(work.width, work.height) * 0.003));
        const sealed = closeOpenings(work.mask, work.width, work.height, closureRadius);
        pushLog(`${floor.label}: sealed door openings (radius ${closureRadius}px) before room detection.`);
        const regions = extractRoomRegions(sealed, work.width, work.height);
        pushLog(`${floor.label}: traced ${regions.length} enclosed polygon${regions.length === 1 ? "" : "s"} from the line work.`);
        if (regions.length > 0) {
          const paint = document.createElement("canvas");
          paint.width = work.width; paint.height = work.height;
          const pctx = paint.getContext("2d");
          if (pctx) {
            const id = pctx.createImageData(work.width, work.height);
            const baseColor = DEFAULT_COLORS.room;
            const [r, g, b] = hexToRgb(baseColor);
            const newElements: DetectedElement[] = [];
            regions.forEach((reg, idx) => {
              for (const p of reg.pixels) {
                const i = p * 4;
                id.data[i] = r; id.data[i + 1] = g; id.data[i + 2] = b; id.data[i + 3] = 200;
              }
              newElements.push({
                id: `auto-${Date.now()}-${idx}`,
                category: "room",
                label: `Room ${idx + 1}`,
                polygon: reg.polygon,
                confidence: 0.9,
              });
            });
            pctx.putImageData(id, 0, 0);
            paintedDataUrl = paint.toDataURL("image/png");
            elements = newElements;

            // Pipeline step 8: ask the AI to NAME and CATEGORIZE each
            // region. We send a numbered overlay so the model just has
            // to label by number — no free-form spatial detection.
            try {
              pushLog(`${floor.label}: asking AI to label each room…`);
              const baseImg = new Image();
              await new Promise<void>((res, rej) => {
                baseImg.onload = () => res();
                baseImg.onerror = () => rej(new Error("thumbnail base load"));
                baseImg.src = cleanedUrl;
              });
              const base = document.createElement("canvas");
              base.width = work.width; base.height = work.height;
              const bctx = base.getContext("2d");
              if (bctx) {
                bctx.fillStyle = "#ffffff";
                bctx.fillRect(0, 0, base.width, base.height);
                bctx.drawImage(baseImg, 0, 0, base.width, base.height);
              }
              const overlay = buildClassifierThumbnail(base, regions);
              const regionInput = regions.map((reg, i) => ({
                id: newElements[i].id,
                bbox: [
                  reg.bbox[0] / work.width,
                  reg.bbox[1] / work.height,
                  reg.bbox[2] / work.width,
                  reg.bbox[3] / work.height,
                ] as [number, number, number, number],
                areaFraction: reg.pixels.length / (work.width * work.height),
              }));
              const result = await classifyFloorRegions({
                data: { imageDataUrl: overlay.dataUrl, regions: regionInput, hint: floor.label },
              });
              if (result.ok) {
                const byId = new Map(result.regions.map((r) => [r.id, r] as const));
                elements = newElements.map((el) => {
                  const cls = byId.get(el.id);
                  if (!cls) return el;
                  return { ...el, category: cls.category, label: cls.label, confidence: cls.confidence };
                });
                pushLog(`${floor.label}: labeled ${result.regions.length} region${result.regions.length === 1 ? "" : "s"} (kitchen, bath, bedroom…).`);
              } else {
                pushLog(`${floor.label}: AI labeling skipped — ${result.error}`);
              }
            } catch (cause) {
              const msg = cause instanceof Error ? cause.message : "unknown";
              pushLog(`${floor.label}: AI labeling skipped (${msg}).`);
            }
          }
        }
        pushLog(`${floor.label}: ready. Tap any shape to recolor it or pick a different category.`);
      }
      onDetectionsChange({
        ...detections,
        [floor.index]: {
          elements,
          hidden: detections[floor.index]?.hidden ?? {},
          colors: { ...DEFAULT_COLORS, ...(detections[floor.index]?.colors ?? {}) },
          replannedDataUrl: cleanedUrl,
          paintedDataUrl,
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
    pushUndo(activeFloor.index, snapshotOf(activeDetection));
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
    if ((activeDetection.elements.length ?? 0) > 0 || activeDetection.paintedDataUrl) {
      pushUndo(activeFloor.index, snapshotOf(activeDetection));
    }
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

  const undo = useCallback(() => {
    if (!activeFloor || !activeDetection) return;
    const stack = undoRef.current[activeFloor.index] ?? [];
    const prev = stack.pop();
    if (!prev) return;
    (redoRef.current[activeFloor.index] ??= []).push(snapshotOf(activeDetection));
    undoRef.current[activeFloor.index] = stack;
    setHistoryTick((t) => t + 1);
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: { ...activeDetection, ...prev },
    });
  }, [activeFloor, activeDetection, detections, onDetectionsChange]);

  const redo = useCallback(() => {
    if (!activeFloor || !activeDetection) return;
    const stack = redoRef.current[activeFloor.index] ?? [];
    const next = stack.pop();
    if (!next) return;
    (undoRef.current[activeFloor.index] ??= []).push(snapshotOf(activeDetection));
    redoRef.current[activeFloor.index] = stack;
    setHistoryTick((t) => t + 1);
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: { ...activeDetection, ...next },
    });
  }, [activeFloor, activeDetection, detections, onDetectionsChange]);

  // Keyboard shortcuts: Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z (or Ctrl/Cmd+Y) for redo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName)) return;
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const canUndo = !!activeFloor && (undoRef.current[activeFloor.index]?.length ?? 0) > 0;
  const canRedo = !!activeFloor && (redoRef.current[activeFloor.index]?.length ?? 0) > 0;
  // historyTick is intentionally referenced to recompute the flags above.
  void historyTick;

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

  // ---- SVG vector editor helpers --------------------------------------

  function updateElement(id: string, mutate: (el: DetectedElement) => DetectedElement) {
    if (!activeFloor || !activeDetection) return;
    pushUndo(activeFloor.index, snapshotOf(activeDetection));
    const next = activeDetection.elements.map((e) => (e.id === id ? mutate(e) : e));
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: { ...activeDetection, elements: next },
    });
  }

  function setElementFill(id: string, color: string) {
    if (!activeFloor || !activeDetection) return;
    pushUndo(activeFloor.index, snapshotOf(activeDetection));
    const fills = { ...(activeDetection.fills ?? {}), [id]: color };
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: { ...activeDetection, fills },
    });
  }

  function deleteElement(id: string) {
    if (!activeFloor || !activeDetection) return;
    pushUndo(activeFloor.index, snapshotOf(activeDetection));
    const fills = { ...(activeDetection.fills ?? {}) };
    delete fills[id];
    onDetectionsChange({
      ...detections,
      [activeFloor.index]: {
        ...activeDetection,
        elements: activeDetection.elements.filter((e) => e.id !== id),
        fills,
      },
    });
    setSelectedId(null);
  }

  // Convert a pointer event into SVG-normalized (0..1) coordinates.
  function svgPoint(evt: React.PointerEvent<SVGElement> | PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: (evt.clientX - rect.left) / rect.width, y: (evt.clientY - rect.top) / rect.height };
  }

  function onShapePointerDown(evt: React.PointerEvent<SVGPolygonElement>, el: DetectedElement) {
    evt.stopPropagation();
    setSelectedId(el.id);
    if (tool === "paint" && paintCategory) {
      const color = (activeDetection?.colors?.[paintCategory]) ?? DEFAULT_COLORS[paintCategory];
      // Paint also re-categorises the element so legend counts stay accurate.
      if (el.category !== paintCategory) {
        updateElement(el.id, (e) => ({ ...e, category: paintCategory }));
      }
      setElementFill(el.id, color);
      return;
    }
    if (tool === "move") {
      const p = svgPoint(evt);
      if (!p) return;
      dragRef.current = { id: el.id, startX: p.x, startY: p.y, orig: el.polygon.map(([x, y]) => [x, y]) };
      (evt.currentTarget as Element).setPointerCapture?.(evt.pointerId);
    }
  }

  function onSvgPointerMove(evt: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = svgPoint(evt);
    if (!p) return;
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    if (!activeFloor || !activeDetection) return;
    const next = activeDetection.elements.map((e) =>
      e.id === drag.id ? { ...e, polygon: drag.orig.map(([x, y]) => [Math.min(1, Math.max(0, x + dx)), Math.min(1, Math.max(0, y + dy))] as [number, number]) } : e,
    );
    onDetectionsChange({ ...detections, [activeFloor.index]: { ...activeDetection, elements: next } });
  }

  function onSvgPointerUp(evt: React.PointerEvent<SVGSVGElement>) {
    if (dragRef.current) {
      // Snapshot AFTER the drag so undo restores the pre-drag position.
      // The first move already pushed an undo via updateElement? No — we
      // mutated directly. Push one snapshot now of the moved state's
      // PREVIOUS frame from history? Simpler: snapshot the un-dragged
      // polygon as the undo target.
      const drag = dragRef.current;
      if (activeFloor && activeDetection) {
        const stack = undoRef.current[activeFloor.index] ?? [];
        const originalElements = activeDetection.elements.map((e) =>
          e.id === drag.id ? { ...e, polygon: drag.orig } : e,
        );
        stack.push({
          elements: originalElements,
          paintedDataUrl: activeDetection.paintedDataUrl,
          planWidthMeters: activeDetection.planWidthMeters,
          calibration: activeDetection.calibration,
          fills: activeDetection.fills,
        });
        if (stack.length > 50) stack.shift();
        undoRef.current[activeFloor.index] = stack;
        redoRef.current[activeFloor.index] = [];
        setHistoryTick((t) => t + 1);
      }
      dragRef.current = null;
      (evt.currentTarget as Element).releasePointerCapture?.(evt.pointerId);
    }
  }

  // Delete-key shortcut for the SVG editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, activeFloor?.index]);

  const colors = { ...DEFAULT_COLORS, ...(activeDetection?.colors ?? {}) };
  const displayUrl = activeDetection?.replannedDataUrl ?? activeFloor?.imageDataUrl;

  return <div className="mt-6 rounded-2xl border border-foreground/30 bg-background p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Step · Clean &amp; paint each boundary</p>
        <p className="mt-1 text-xs text-muted-foreground">
          AI cleans the drawing — the white paper goes transparent while every black line stays at full strength.
          Then YOU paint each <strong>enclosed surface inside the black-line boundaries</strong>: pick a legend color
          (wall, room, door, window, stair, fixture) and tap the empty area inside its contour. The paint floods
          out from your click until it hits the surrounding black lines, so one tap colors a whole room, one tap
          colors a whole wall poché — no tracing.
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
      <div className="relative">
        {/* Tool + zoom strip */}
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full border border-border bg-background/95 p-1 shadow-sm backdrop-blur">
          <Button type="button" size="icon" variant={tool === "pick" ? "default" : "ghost"} className="size-7" onClick={() => setTool("pick")} aria-label="Select" title="Select (V)">
            <MousePointer2 className="size-3.5" />
          </Button>
          <Button type="button" size="icon" variant={tool === "paint" ? "default" : "ghost"} className="size-7" onClick={() => setTool("paint")} aria-label="Paint" title="Paint (B)">
            <Paintbrush className="size-3.5" />
          </Button>
          <Button type="button" size="icon" variant={tool === "move" ? "default" : "ghost"} className="size-7" onClick={() => setTool("move")} aria-label="Move" title="Move (M)">
            <Move className="size-3.5" />
          </Button>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))} disabled={zoom <= 0.25} aria-label="Zoom out">
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="min-w-10 text-center text-[10px] font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setZoom((z) => Math.min(6, +(z + 0.25).toFixed(2)))} disabled={zoom >= 6} aria-label="Zoom in">
            <ZoomIn className="size-3.5" />
          </Button>
          <Button type="button" size="icon" variant="ghost" className="size-7" onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Reset zoom" title="Fit">
            <Maximize2 className="size-3.5" />
          </Button>
        </div>

        <div className="relative max-h-[75vh] overflow-auto rounded-xl border border-border bg-white">
          {/* The SVG IS the editor. White sheet, faint paper grid behind, the
              cleaned plan as a faint vector reference, every detected
              region as an interactive <polygon>. No raster paint, no
              checker background. */}
          <div
            className="relative"
            style={{
              width: `${100 * zoom}%`,
              backgroundImage:
                "linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
              backgroundColor: "#ffffff",
            }}
          >
            <svg
              ref={svgRef}
              viewBox="0 0 1 1"
              preserveAspectRatio="xMidYMid meet"
              className="block w-full"
              style={{ aspectRatio: "1 / 1", touchAction: "none" }}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
              onPointerLeave={onSvgPointerUp}
              onClick={() => { if (tool === "pick") setSelectedId(null); }}
            >
              {/* Faint reference: cleaned line drawing under the vector layer. */}
              {displayUrl && <image href={displayUrl} x={0} y={0} width={1} height={1} preserveAspectRatio="xMidYMid meet" opacity={0.22} style={{ pointerEvents: "none" }} />}

              {/* Interactive shapes. */}
              {activeDetection?.elements.map((el) => {
                const isSelected = el.id === selectedId;
                const isHover = el.id === hoverId;
                const fill = activeDetection.fills?.[el.id] ?? colors[el.category];
                const points = el.polygon.map(([x, y]) => `${x},${y}`).join(" ");
                return <polygon
                  key={el.id}
                  points={points}
                  fill={fill}
                  fillOpacity={isSelected ? 0.7 : isHover ? 0.55 : 0.42}
                  stroke={isSelected ? "#111" : isHover ? "#333" : fill}
                  strokeWidth={isSelected ? 0.004 : 0.0015}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    cursor: tool === "move" ? "grab" : tool === "paint" ? "crosshair" : "pointer",
                    transition: "fill-opacity 120ms ease",
                  }}
                  onPointerDown={(e) => onShapePointerDown(e, el)}
                  onPointerEnter={() => setHoverId(el.id)}
                  onPointerLeave={() => setHoverId((h) => (h === el.id ? null : h))}
                />;
              })}

              {/* Selected element's vertex handles (visual marker; non-interactive for now). */}
              {selectedId && activeDetection?.elements.find((e) => e.id === selectedId)?.polygon.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={0.005} fill="#111" stroke="#fff" strokeWidth={0.002} vectorEffect="non-scaling-stroke" style={{ pointerEvents: "none" }} />
              ))}
            </svg>
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

        {/* Status / selected element info */}
        {selectedId && activeDetection && (() => {
          const el = activeDetection.elements.find((e) => e.id === selectedId);
          if (!el) return null;
          return <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1 text-[11px]">
            <span className="font-semibold">{el.label}</span>
            <span className="text-muted-foreground">· {CATEGORY_LABEL[el.category]}</span>
            <span className="ml-auto inline-flex items-center gap-1">
              <input type="color" value={activeDetection.fills?.[el.id] ?? colors[el.category]} onChange={(e) => setElementFill(el.id, e.target.value)} className="size-4 cursor-pointer rounded border border-border bg-transparent" aria-label="Element color" />
              <Button type="button" size="icon" variant="ghost" className="size-6" onClick={() => deleteElement(el.id)} aria-label="Delete element">
                <Trash2 className="size-3" />
              </Button>
            </span>
          </div>;
        })()}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Legend · pick a category for paint mode</p>
          {tool === "paint" && paintCategory && <p className="mt-1 text-[10px] text-foreground/80 inline-flex items-center gap-1"><Paintbrush className="size-3" />Paint mode · click any shape to colour it as <span className="font-semibold">{CATEGORY_LABEL[paintCategory]}</span>. <button type="button" className="underline" onClick={() => setPaintCategory(null)}>Stop</button></p>}
          {tool === "move" && <p className="mt-1 text-[10px] text-foreground/80 inline-flex items-center gap-1"><Move className="size-3" />Move mode · drag any shape to reposition it.</p>}
          {tool === "pick" && <p className="mt-1 text-[10px] text-foreground/80 inline-flex items-center gap-1"><MousePointer2 className="size-3" />Select mode · click a shape to inspect, recolour or delete it.</p>}
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
                  onClick={() => {
                    if (isPainting && tool === "paint") { setPaintCategory(null); return; }
                    setPaintCategory(cat);
                    setTool("paint");
                  }}
                  disabled={!activeDetection?.replannedDataUrl}
                >{CATEGORY_LABEL[cat]}</button>
                <span className="tabular-nums text-muted-foreground">{count}</span>
              </li>;
            })}
          </ul>
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="outline" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">
              <Undo2 className="size-3" />
              Undo
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={redo} disabled={!canRedo} title="Redo (Shift+Ctrl/Cmd+Z)">
              <Redo2 className="size-3" />
              Redo
            </Button>
          </div>
          <Button type="button" size="sm" variant="outline" className="w-full" onClick={clearPaint} disabled={!activeDetection?.replannedDataUrl || (activeDetection?.elements.length ?? 0) === 0}>
            <Trash2 className="size-3" />
            Clear paint on this floor
          </Button>
        </div>
      </div>
    </div>}
  </div>;
}