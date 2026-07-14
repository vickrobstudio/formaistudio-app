import { useNavigate } from "@tanstack/react-router";
import { shrinkImageDataUrl } from "@/lib/shrink-image";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, Eye, LoaderCircle, Plus, Ruler, ScanSearch, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { ToolInformation, type ToolInfoSection } from "@/components/ToolInformation";
import { useCredits } from "@/hooks/use-credits";
import { generateFloor3D, extractFurnitureBounds, liftAnnotatedFloor, detectFloorElements, MARK_LIFT_SPECS, MARK_LIFT_TYPES, type MarkLiftType } from "@/lib/floor-3d.functions";
import { startMeshReconstruction, pollMeshReconstruction } from "@/lib/mesh-recon.functions";
import { streamImage } from "@/lib/stream-image";
import { Furniture3DPreview } from "@/components/Furniture3DPreview";
import { Building3DViewer } from "@/components/Building3DViewer";
import { ScaleCalibrator } from "@/components/ScaleCalibrator";
import type { FurniturePlan } from "@/lib/floor-3d-shared";
import type { VectorRecognition } from "@/lib/dwg-vector-plan";

type RecognizedPolygon = { id: string; type: MarkLiftType; points: Array<[number, number]> };
type Recognition = {
  imageWidth: number;
  imageHeight: number;
  planWidthMeters: number;
  polygons: RecognizedPolygon[];
};

const information: ToolInfoSection[] = [
  {
    title: "How it works",
    description: "Upload a floor plan (one image per floor) or a furniture drawing. Tap Build. Download the 3D file.",
    items: [
      "Buildings: add one image per floor — each floor becomes its own group at real-world scale.",
      "Furniture: upload one clear reference (drawing, sketch or photo) — the AI designs it into one solid piece, then builds the 3D model.",
      "Export: .fbx, .obj, or .dae — opens in SketchUp, Blender, Rhino, Maya, 3ds Max.",
    ],
  },
];

const FURNITURE_MATERIALS = ["Solid wood", "Walnut", "Oak", "Metal", "Steel", "Brass", "Glass", "Marble", "Stone", "Leather", "Fabric", "Rattan", "Concrete"];

const CLIENT_TIMEOUT_MS = 1_800_000;
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => { id = setTimeout(() => reject(new Error(message)), ms); });
  return Promise.race([promise, t]).finally(() => { if (id) clearTimeout(id); });
}

function isPdf(file: File): boolean { return file.type === "application/pdf" || /\.pdf$/i.test(file.name); }
function isDxf(file: File): boolean { return /\.dxf$/i.test(file.name); }
function isDwg(file: File): boolean { return /\.dwg$/i.test(file.name); }

function readRaw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
}

function readImageOptimized(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) return readRaw(file);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const sw = img.naturalWidth || img.width;
        const sh = img.naturalHeight || img.height;
        const scale = Math.min(1, MAX_DIMENSION / Math.max(sw, sh));
        const w = Math.max(1, Math.round(sw * scale));
        const h = Math.max(1, Math.round(sh * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not optimize image.");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      } catch (e) { reject(e instanceof Error ? e : new Error("Could not optimize image.")); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image.")); };
    img.src = url;
  });
}

async function readDrawing(file: File): Promise<string> {
  if (isDwg(file) || isDxf(file)) {
    const { parseDrawing, rasterizeDatabase } = await import("@/lib/dwg-database");
    const db = await parseDrawing(file);
    return rasterizeDatabase(db, { maxDimension: MAX_DIMENSION }).dataUrl;
  }
  if (isPdf(file)) return readRaw(file);
  return readImageOptimized(file);
}

/**
 * AutoCAD drawings: ONLY export paper-space layouts (floors, roof, site plan,
 * etc.) — never the Model space view. Layouts are classified by tab name so
 * we can label them "Ground floor", "Roof", "Site plan"…
 */
async function readDrawingSheets(file: File): Promise<Array<{ dataUrl: string; label: string; vector?: VectorRecognition }>> {
  if (isDwg(file) || isDxf(file)) {
    const { parseDrawing, rasterizeDatabase } = await import("@/lib/dwg-database");
    const { buildVectorRecognition } = await import("@/lib/dwg-vector-plan");
    const db = await parseDrawing(file);
    const out: Array<{ dataUrl: string; label: string; vector?: VectorRecognition }> = [];

    // Vector-first: Model space carries the real-world coordinates, so it
    // yields a deterministic no-AI extraction (boundaries + rooms + true
    // scale from CAD units). Paper-space sheets follow as plain rasters.
    const modelEntities = (() => {
      const model = (db.layouts ?? []).find((l) => l.isModelSpace)?.entities ?? [];
      return model.length >= db.entities.length ? model : db.entities;
    })();
    if (modelEntities.length > 0) {
      // Building mode: clean the DWG to the building shell — keep walls,
      // doors, windows, floors and roof; strip furniture, fixtures, MEP and
      // site layers.
      let vectorOk = false;
      try {
        const vector = await buildVectorRecognition(db, modelEntities, { architecturalOnly: true });
        if (vector) {
          out.push({ dataUrl: await shrinkImageDataUrl(vector.dataUrl, 2400, 0.85), label: "Ground floor", vector });
          vectorOk = true;
        }
      } catch (cause) {
        console.warn("vector extraction failed — falling back to model-space raster", cause);
      }
      if (!vectorOk) {
        // Vector polygonization couldn't cope — rasterize the cleaned model
        // space and let the image pipeline (shape tracer + tiled AI) take over.
        try {
          const raster = rasterizeDatabase(db, { maxDimension: MAX_DIMENSION, entities: modelEntities, projectViewports: false, architecturalOnly: true });
          if (raster.drawableCount > 0) {
            out.push({ dataUrl: await shrinkImageDataUrl(raster.dataUrl, 2400, 0.85), label: "Ground floor" });
          }
        } catch (cause) {
          console.warn("model-space raster failed", cause);
        }
      }
    }

    const layouts = (db.layouts ?? []).filter((l) => !l.isModelSpace && l.entities.length > 0);
    if (out.length === 0 && layouts.length === 0) throw new Error("This DWG/DXF has no plan linework in Model space and no paper-space layouts to import.");
    let floorOrder = 0;
    for (const layout of layouts) {
      const { dataUrl, drawableCount } = rasterizeDatabase(db, { maxDimension: MAX_DIMENSION, entities: layout.entities, projectViewports: false });
      if (drawableCount === 0) continue;
      const name = (layout.name || "").toLowerCase();
      let label: string;
      if (/\broof\b/.test(name)) label = "Roof";
      else if (/\b(site|plot|survey)\b/.test(name)) label = "Site plan";
      else if (/\belev/.test(name)) label = layout.name;
      else if (/\b(basement|cellar)\b/.test(name)) { label = "Basement"; }
      else if (/\b(ground|level 0|l0|first floor|main)\b/.test(name)) { label = "Ground floor"; floorOrder = Math.max(floorOrder, 1); }
      else {
        label = layout.name || (floorOrder === 0 ? "Ground floor" : `Floor ${floorOrder}`);
        floorOrder++;
      }
      out.push({ dataUrl, label });
    }
    if (out.length === 0) throw new Error("The CAD layouts only contain model-space viewports. Publish/plot the actual plan linework into paper-space layout sheets, then upload again.");
    return out;
  }
  const single = isPdf(file) ? await readRaw(file) : await readImageOptimized(file);
  return [{ dataUrl: single, label: "" }];
}

type Stage = "upload" | "modeling" | "ready";
type Floor = {
  imageDataUrl: string;
  label: string;
  heightMeters: number;
  fileName: string;
  recognition?: Recognition;
  recognizing?: boolean;
  recognizeError?: string;
  planWidthMetersOverride?: number;
  /** Room boundaries + names read from CAD TEXT entities (vector path). */
  vectorRooms?: Array<{ name?: string; points: Array<[number, number]> }>;
  /** How the plan scale was determined — drives the report's scale method. */
  scaleSource?: "cad" | "user";
};
type FloorPart = { index: number; label: string; daeDataUrl: string; objDataUrl: string; fbxDataUrl: string; glbDataUrl?: string };
type BuildReport = {
  label: string;
  counts: { confirmed: number; inferred: number; assumed: number };
  assumptions: string[];
  missing: string[];
  conflicts: string[];
  geometryJsonDataUrl?: string;
  reportMarkdownDataUrl?: string;
};

export function FloorTo3D() {
  const navigate = useNavigate();
  const generate = useServerFn(generateFloor3D);
  const fetchBounds = useServerFn(extractFurnitureBounds);
  const lift = useServerFn(liftAnnotatedFloor);
  const detect = useServerFn(detectFloorElements);
  const startRecon = useServerFn(startMeshReconstruction);
  const pollRecon = useServerFn(pollMeshReconstruction);
  const { credits, signedIn, vip, consume } = useCredits();

  const [subject, setSubject] = useState<"building" | "furniture">("building");
  const [outputUnits, setOutputUnits] = useState<"meters" | "feet">("feet");
  const [planUnits, setPlanUnits] = useState<"meters" | "feet-inches">("feet-inches");

  // Building state
  const [floors, setFloors] = useState<Floor[]>([]);
  const floorInputRef = useRef<HTMLInputElement>(null);

  // Furniture state
  const [furnitureUrl, setFurnitureUrl] = useState<string | null>(null);
  const [furnitureName, setFurnitureName] = useState("");
  const [furnitureDesc, setFurnitureDesc] = useState("");
  const [furnitureMaterials, setFurnitureMaterials] = useState<string[]>([]);
  const furnitureInputRef = useRef<HTMLInputElement>(null);

  // Result state
  const [stage, setStage] = useState<Stage>("upload");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [floorParts, setFloorParts] = useState<FloorPart[]>([]);
  const [buildReports, setBuildReports] = useState<BuildReport[]>([]);
  const [dae, setDae] = useState<string | null>(null);
  const [obj, setObj] = useState<string | null>(null);
  const [fbx, setFbx] = useState<string | null>(null);
  const [glb, setGlb] = useState<string | null>(null);
  const [plan, setPlan] = useState<FurniturePlan | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"fbx" | "obj" | "dae">("fbx");
  const previewRef = useRef<HTMLDivElement>(null);
  const [recognitionPreview, setRecognitionPreview] = useState<number | null>(null);
  const [calibrating, setCalibrating] = useState<number | null>(null);

  function reset() {
    setStage("upload"); setBusy(false); setProgress(0); setStatus(""); setError("");
    setFloorParts([]); setBuildReports([]); setDae(null); setObj(null); setFbx(null); setGlb(null); setPlan(null);
  }

  function getImageSize(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      img.onerror = () => reject(new Error("Could not read image dimensions."));
      img.src = src;
    });
  }

  // Auto-recognise architectural elements the moment an image floor is added
  // (no manual Recognise step). DWG/DXF sheets already arrive with vector
  // recognition, so only raster floors that haven't been read trigger this.
  useEffect(() => {
    if (subject !== "building") return;
    floors.forEach((f, i) => {
      if (f.imageDataUrl.startsWith("data:image/") && !f.recognition && !f.recognizing && !f.recognizeError) {
        void runRecognition(i, true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floors, subject]);

  async function runRecognition(index: number, silent = false) {
    const f = floors[index];
    if (!f || !f.imageDataUrl.startsWith("data:image/")) return;
    setFloors((p) => p.map((x, j) => j === index ? { ...x, recognizing: true, recognizeError: undefined } : x));
    try {
      const { width, height } = await getImageSize(f.imageDataUrl);
      // Deterministic shape tracing supplies walls + floors that hug the
      // black linework; the AI adds doors, windows, stairs and fixtures.
      const [shapes, result, tiled] = await Promise.all([
        import("@/lib/image-plan-shapes").then((m) => m.extractPlanShapes(f.imageDataUrl)).catch(() => null),
        detect({ data: { imageDataUrl: f.imageDataUrl, imageWidth: width, imageHeight: height } }).catch(() => null),
        // Door/window symbols are tiny on a full sheet — a 2×2 tiled pass
        // gives the AI 4× the resolution to actually see them.
        import("@/lib/tiled-openings").then((m) => m.detectOpeningsTiled(f.imageDataUrl, (input) => detect(input))).catch(() => []),
      ]);
      // Arbitration: a traced region is a real room if a printed room label
      // sits inside it OR its outline runs firmly along walls. Dimension
      // slivers, title blocks and site cells fail both and are dropped
      // together with their wall bands.
      const labels = result && result.ok ? (result.roomLabels ?? []) : [];
      const { pointInPolygon } = await import("@/lib/image-plan-shapes");
      // Outdoor amenities are drawn and labeled but are not rooms to lift.
      const OUTDOOR_LABEL = /\b(pool|spa|sun\s?deck|deck|planter|port\s?cochere|driveway|patio|terrace|garden|yard|equipment)\b/i;
      const keptRooms = (shapes?.rooms ?? []).filter((room) => {
        const label = labels.find((l) => pointInPolygon(l.at[0], l.at[1], room.points));
        if (label && !OUTDOOR_LABEL.test(label.name)) return true;
        return room.wallScore >= 0.7 && room.textScore < 0.06 && !(label && OUTDOOR_LABEL.test(label.name));
      });
      const keptIndex = new Set(keptRooms.map((room) => room.index));
      const traced: RecognizedPolygon[] = (shapes?.polygons ?? [])
        .filter((p) => {
          const m = p.id.match(/^shape_(?:floor|wall|door|window)_(\d+)/);
          return !m || keptIndex.has(Number(m[1]));
        })
        .map((p) => ({ id: p.id, type: p.type as MarkLiftType, points: p.points }));
      const ai: RecognizedPolygon[] = (result && result.ok ? result.polygons : []).map((p, k) => ({
        id: p.id ?? `det_${k}`,
        type: p.type as MarkLiftType,
        points: p.points as Array<[number, number]>,
      }));
      // Openings: tiled detections first (sharper), full-sheet extras that
      // aren't duplicates second.
      const centerOf = (pts: Array<[number, number]>): [number, number] => [
        pts.reduce((s, p) => s + p[0], 0) / pts.length,
        pts.reduce((s, p) => s + p[1], 0) / pts.length,
      ];
      const openings: RecognizedPolygon[] = tiled.map((p, k) => ({ id: `tile_${k}`, type: p.type as MarkLiftType, points: p.points }));
      for (const p of ai.filter((q) => q.type !== "wall" && q.type !== "floor")) {
        const [cx, cy] = centerOf(p.points);
        const dupe = openings.some((o) => o.type === p.type && (([ox, oy]) => Math.hypot(cx - ox, cy - oy) < 0.015)(centerOf(o.points)));
        if (!dupe) openings.push(p);
      }
      const useTraced = traced.some((p) => p.type === "floor");
      const polygons: RecognizedPolygon[] = useTraced
        ? [...traced, ...openings]
        : [...ai, ...openings.filter((o) => o.id.startsWith("tile_"))];
      const namedRooms = useTraced
        ? keptRooms.map((room) => ({
            points: room.points,
            name: labels.find((l) => pointInPolygon(l.at[0], l.at[1], room.points))?.name,
          }))
        : undefined;
      if (!polygons.length) {
        const message = result && !result.ok ? result.error : "No enclosed shapes found — upload a sharper plan with clear walls.";
        setFloors((p) => p.map((x, j) => j === index ? { ...x, recognizing: false, recognizeError: message } : x));
        return;
      }
      setFloors((p) => p.map((x, j) => j === index ? {
        ...x,
        recognizing: false,
        recognition: { imageWidth: width, imageHeight: height, planWidthMeters: x.planWidthMetersOverride ?? 12, polygons },
        vectorRooms: namedRooms ?? x.vectorRooms,
      } : x));
      if (!silent) setRecognitionPreview(index);
    } catch (cause) {
      setFloors((p) => p.map((x, j) => j === index ? { ...x, recognizing: false, recognizeError: cause instanceof Error ? cause.message : "Recognition failed." } : x));
    }
  }

  async function onFloorUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (event.target) event.target.value = "";
    if (files.length === 0) return;
    for (const file of files) {
      if (file.size > 200_000_000) { setError(`"${file.name}" is too large (200 MB max).`); return; }
    }
    setError("");
    setUploading(true);
    try {
      const next: Floor[] = [];
      for (const file of files) {
        const sheets = await readDrawingSheets(file);
        for (const sheet of sheets) {
          const idx = floors.length + next.length;
          const label = sheet.label || (idx === 0 ? "Ground floor" : `Floor ${idx}`);
          next.push({
            imageDataUrl: sheet.dataUrl,
            label,
            heightMeters: 3.0,
            fileName: sheets.length > 1 ? `${file.name} — ${label}` : file.name,
            ...(sheet.vector
              ? {
                  recognition: sheet.vector.recognition,
                  vectorRooms: sheet.vector.rooms,
                  ...(sheet.vector.needsCalibration
                    ? {}
                    : { planWidthMetersOverride: sheet.vector.planWidthMeters, scaleSource: "cad" as const }),
                }
              : {}),
          });
        }
      }
      if (floors.length + next.length > 10) { setError("Up to 10 floors."); return; }
      setFloors((prev) => [...prev, ...next]);
      reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read file."); }
    finally { setUploading(false); }
  }

  async function onFurnitureUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = "";
    if (!file) return;
    if (file.size > 200_000_000) { setError("File too large (200 MB max)."); return; }
    setError("");
    setUploading(true);
    try {
      const url = await readDrawing(file);
      setFurnitureUrl(url);
      setFurnitureName(file.name);
      reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read file."); }
    finally { setUploading(false); }
  }

  // Progress simulation while busy
  useEffect(() => {
    if (!busy) { setProgress(0); return; }
    const started = Date.now();
    const target = subject === "furniture" ? 180_000 : floors.length * 45_000 + 15_000;
    const id = setInterval(() => {
      const elapsed = Date.now() - started;
      setProgress(Math.min(95, 100 * (1 - Math.exp(-elapsed / (target * 0.4)))));
    }, 250);
    return () => clearInterval(id);
  }, [busy, subject, floors.length]);

  useEffect(() => {
    if (stage === "ready") setProgress(100);
    if (stage !== "upload" && previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [stage]);

  async function buildBuilding() {
    if (floors.length === 0) { setError("Add at least one floor plan."); return; }
    setBusy(true); setError(""); setFloorParts([]); setBuildReports([]); setStage("modeling");
    if (!(await consume())) {
      setBusy(false); setStage("upload");
      void navigate({ to: "/pricing" }); return;
    }
    try {
      const parts: FloorPart[] = [];
      let firstError = "";
      for (let i = 0; i < floors.length; i += 1) {
        const f = floors[i];
        const label = f.label?.trim() || (i === 0 ? "Ground floor" : `Floor ${i}`);
        setStatus(`Building ${label} (${i + 1}/${floors.length})…`);
        try {
          const result = f.recognition
            ? await withTimeout(lift({
                data: {
                  label,
                  imageWidth: f.recognition.imageWidth,
                  imageHeight: f.recognition.imageHeight,
                  planWidthMeters: f.planWidthMetersOverride ?? f.recognition.planWidthMeters,
                  outputUnits,
                  wallHeightMeters: f.heightMeters || 3.0,
                  polygons: f.recognition.polygons.map((p: RecognizedPolygon) => ({ id: p.id, type: p.type, points: p.points })),
                  rooms: f.vectorRooms ?? [],
                  scaleMethod: f.scaleSource === "cad" ? "cad_units" as const : "user_calibration" as const,
                },
              }), CLIENT_TIMEOUT_MS, `${label} took too long.`)
            : await withTimeout(generate({
                data: {
                  wallHeightMeters: f.heightMeters || 3.0,
                  planUnits, outputUnits, subject: "building",
                  building: {
                    scope: "floor",
                    floors: [{ imageDataUrl: f.imageDataUrl, label, heightMeters: f.heightMeters || 3.0, planWidthMeters: f.planWidthMetersOverride }],
                  },
                },
              }), CLIENT_TIMEOUT_MS, `${label} took too long.`);
          if (!result.ok) { firstError ||= result.error; continue; }
          const got = result.floorParts?.[0];
          if (!got) { firstError ||= `${label} returned no model.`; continue; }
          parts.push(got);
          setFloorParts([...parts]);
          if ("report" in result && result.report) {
            const r = result.report;
            setBuildReports((prev) => [...prev, {
              label,
              counts: r.counts,
              assumptions: r.assumptions,
              missing: r.missing,
              conflicts: r.conflicts,
              geometryJsonDataUrl: result.geometryJsonDataUrl,
              reportMarkdownDataUrl: result.reportMarkdownDataUrl,
            }]);
          }
        } catch (cause) {
          firstError ||= cause instanceof Error ? cause.message : `${label} failed.`;
        }
      }
      if (parts.length === 0) { setError(firstError || "Could not analyse the drawings. Try clearer images."); setStage("upload"); return; }
      if (firstError) setError(`Some floors couldn't be built. ${parts.length} model${parts.length === 1 ? "" : "s"} ready.`);
      setStage("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The 3D model could not be generated.");
      setStage("upload");
    } finally { setBusy(false); setStatus(""); }
  }

  async function buildFurniture() {
    if (!furnitureUrl) return;
    setBusy(true); setError(""); setDae(null); setObj(null); setFbx(null); setGlb(null); setPlan(null); setStage("modeling");
    setStatus("Reading dimensions from your drawing…");
    if (!(await consume())) {
      setBusy(false); setStage("upload");
      void navigate({ to: "/pricing" }); return;
    }
    try {
      let bounds: { width: number; depth: number; height: number } | undefined;
      try {
        const b = await fetchBounds({ data: { fileDataUrl: furnitureUrl, planUnits, referenceImages: [] } });
        if (b.ok) bounds = { width: b.width, depth: b.depth, height: b.height };
      } catch { /* fallback unscaled */ }

      // The AI reads the reference (line drawing, sketch or photo) and
      // renders ONE complete solid furniture piece — a clean product photo,
      // NOT extruded linework. Mesh reconstruction then runs on that solid
      // render, so the 3D model is a real object, not a flattened drawing.
      setStatus("Isolating the furniture and designing the solid piece…");
      let solidRender = furnitureUrl;
      try {
        const materialLine = furnitureMaterials.length
          ? ` Make it out of these materials: ${furnitureMaterials.join(", ")} — apply them faithfully to the correct parts (frame, legs, seat, top, upholstery) with realistic grain, weave, veining and reflectance.`
          : "";
        const descLine = furnitureDesc.trim()
          ? ` The user describes it as: "${furnitureDesc.trim()}". Honour that description for style, function and details while keeping the shape of the reference.`
          : "";
        const renderPrompt =
          "This is a raw reference PHOTOGRAPH. Find the SINGLE main piece of furniture in it and IGNORE everything else — remove the background completely, and remove any people, walls, floor, other furniture, clutter, plants and props. Reconstruct ONLY that one furniture piece as accurately as possible: keep its exact shape, silhouette, proportions, structure and design details. Render it as ONE complete, solid, manufacturable object — a clean studio product photograph on a plain seamless neutral background, isolated with generous margins, three-quarter view, fully solid with real thickness and volume, evenly lit, sharp, no shadows cast on other objects."
          + materialLine + descLine
          + " Strictly photoreal — NOT a line drawing, NOT a wireframe, no outlines, no annotations, no text, no extra objects. A single real physical object ready to be turned into a 3D model.";
        let out: string | null = null;
        await streamImage(renderPrompt, furnitureUrl, (image, isFinal) => { if (isFinal || !out) out = image; });
        if (out) solidRender = out;
      } catch {
        // If the render step fails, fall back to reconstructing the reference
        // directly rather than blocking the whole build.
      }

      setStatus("Reconstructing textured mesh — this takes 1–5 minutes…");
      const started = await startRecon({ data: { imageDataUrl: solidRender, quality: "high" } });
      if (!started.ok) { setError(started.error); setStage("upload"); return; }
      const deadline = Date.now() + 10 * 60 * 1000;
      while (true) {
        if (Date.now() > deadline) { setError("Reconstruction timed out after 10 minutes."); setStage("upload"); return; }
        await new Promise((r) => setTimeout(r, 6000));
        const polled = await pollRecon({ data: { predictionId: started.predictionId, outputUnits, targetBoundsMeters: bounds } });
        if (!polled.ok) { setError(polled.error); setStage("upload"); return; }
        if (polled.status && polled.status !== "succeeded") {
          setStatus(`Reconstructing — ${polled.status}…`);
          continue;
        }
        if (polled.glbDataUrl) {
          setGlb(polled.glbDataUrl);
          if (polled.daeDataUrl) setDae(polled.daeDataUrl);
          if (polled.objDataUrl) setObj(polled.objDataUrl);
          if (polled.fbxDataUrl) setFbx(polled.fbxDataUrl);
          setStage("ready"); setStatus("");
          return;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mesh reconstruction failed.");
      setStage("upload");
    } finally { setBusy(false); }
  }

  function downloadDataUrl(href: string, filename: string) {
    const a = document.createElement("a");
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function download(format: "dae" | "obj" | "fbx" | "glb") {
    const map: Record<typeof format, string | null> = { dae, obj, fbx, glb };
    const href = map[format];
    if (!href) return;
    const baseName = subject === "furniture" ? (furnitureName.replace(/\.[^.]+$/, "") || "furniture") : "floorplan";
    const a = document.createElement("a");
    a.href = href; a.download = `${baseName}.${format}`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  const canBuild = subject === "building" ? floors.length > 0 : Boolean(furnitureUrl);
  const showResult = stage === "modeling" || stage === "ready";

  return <main className="min-h-screen bg-background">
    <FormaHeader />
    <div className="px-5 pt-7 md:mx-auto md:w-full md:max-w-5xl"><BackLink /></div>
    <PageIntro eyebrow="2D to 3D" title="Plan to 3D model" description="Upload a floor plan or furniture drawing. Tap Build. Download the 3D file.">
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p>
    </PageIntro>

    <section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:mx-auto md:w-full md:max-w-5xl">
      {/* Subject toggle */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <Button type="button" variant={subject === "building" ? "default" : "outline"} onClick={() => { setSubject("building"); reset(); }}>Building</Button>
        <Button type="button" variant={subject === "furniture" ? "default" : "outline"} onClick={() => { setSubject("furniture"); reset(); }}>Furniture</Button>
      </div>

      {/* Upload */}
      {subject === "building" && <div className="space-y-3">
        <input ref={floorInputRef} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,.dxf,.dwg" className="sr-only" onChange={(e) => void onFloorUpload(e)} />
        {floors.length === 0
          ? <Button type="button" variant="outline" disabled={uploading} onClick={() => floorInputRef.current?.click()} className="relative min-h-56 w-full overflow-hidden rounded-2xl p-0">
              <span className="px-6 text-center">
                {uploading ? <LoaderCircle className="mx-auto size-6 animate-spin" /> : <Upload className="mx-auto size-6" />}
                <span className="mt-3 block text-sm font-bold">{uploading ? "Reading drawing…" : "Upload floor plans"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{uploading ? "Parsing sheets, please wait" : "One image per floor · PDF · DWG · DXF · JPG · PNG"}</span>
              </span>
            </Button>
          : <>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Floors · ground first</p>
              <ul className="space-y-2">
                {floors.map((f, i) => <li key={i} className="flex items-center gap-2 rounded-xl border border-border bg-background p-2">
                  <span className="grid h-12 w-14 place-items-center overflow-hidden rounded border border-border bg-secondary text-[9px] text-muted-foreground">
                    {f.imageDataUrl.startsWith("data:image/") ? <img src={f.imageDataUrl} alt="" className="size-full object-contain" /> : "PDF"}
                  </span>
                  <Input value={f.label} onChange={(e) => setFloors((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} className="h-9 flex-1" placeholder={i === 0 ? "Ground floor" : `Floor ${i}`} />
                  {f.imageDataUrl.startsWith("data:image/") && (
                    <button type="button" disabled={!f.recognition} onClick={() => f.recognition && setRecognitionPreview(i)}
                      className="flex items-center gap-1 rounded-full px-2 text-[10px] font-bold uppercase text-muted-foreground disabled:opacity-70"
                      title="Architectural elements the AI recognised on this floor — tap to view">
                      {f.recognizing ? <LoaderCircle className="size-3 animate-spin" /> : f.recognition ? <Eye className="size-3" /> : <ScanSearch className="size-3" />}
                      {f.recognizing ? "Recognising…" : f.recognition ? `${f.recognition.polygons.length} elements` : "Reading…"}
                    </button>
                  )}
                  {f.imageDataUrl.startsWith("data:image/") && (
                    <Button type="button" variant={f.planWidthMetersOverride ? "default" : "outline"} size="sm" className="h-9 gap-1 px-2"
                      onClick={() => setCalibrating(i)}
                      title="Calibrate scale — click two points with a known distance">
                      <Ruler className="size-3" />
                      <span className="text-[10px] font-bold uppercase">{f.planWidthMetersOverride ? (planUnits === "feet-inches" ? `${(f.planWidthMetersOverride / 0.3048).toFixed(0)}ft` : `${f.planWidthMetersOverride.toFixed(1)}m`) : "Scale"}</span>
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFloors((p) => p.filter((_, j) => j !== i))}><X className="size-3" /></Button>
                </li>)}
              </ul>
              <Button type="button" variant="outline" disabled={uploading} className="h-11 w-full justify-between" onClick={() => floorInputRef.current?.click()}>
                <span>{uploading ? "Reading drawing…" : "Add another floor"}</span>
                {uploading ? <LoaderCircle className="animate-spin" /> : <Plus />}
              </Button>
            </>}
      </div>}

      {subject === "furniture" && <div className="space-y-3">
        <input ref={furnitureInputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,.dxf,.dwg" className="sr-only" onChange={(e) => void onFurnitureUpload(e)} />
        <Button type="button" variant="outline" disabled={uploading} onClick={() => furnitureInputRef.current?.click()} className="relative min-h-56 w-full overflow-hidden rounded-2xl p-0">
          {uploading
            ? <span className="px-6 text-center">
                <LoaderCircle className="mx-auto size-6 animate-spin" />
                <span className="mt-3 block text-sm font-bold">Reading drawing…</span>
                <span className="mt-1 block text-xs text-muted-foreground">Parsing your file, please wait</span>
              </span>
            : furnitureUrl && furnitureUrl.startsWith("data:image/")
            ? <img src={furnitureUrl} alt="Furniture drawing" className="max-h-[70vh] w-full object-contain" />
            : <span className="px-6 text-center">
                <Upload className="mx-auto size-6" />
                <span className="mt-3 block text-sm font-bold">{furnitureName || "Upload your furniture drawing"}</span>
                <span className="mt-1 block text-xs text-muted-foreground">PDF · DWG · DXF · JPG · PNG</span>
              </span>}
        </Button>
        {furnitureName && <Button type="button" variant="ghost" size="sm" onClick={() => { setFurnitureUrl(null); setFurnitureName(""); setFurnitureDesc(""); setFurnitureMaterials([]); reset(); }}><X />Remove</Button>}
        {furnitureUrl && <div className="space-y-3 rounded-2xl border border-border p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Guide the model (optional)</p>
          <label className="block text-xs">
            <span className="font-bold uppercase tracking-[0.14em]">Describe the piece</span>
            <Textarea value={furnitureDesc} onChange={(e) => setFurnitureDesc(e.target.value)} maxLength={500} placeholder="e.g. mid-century lounge chair, curved back, tapered legs…" className="mt-2 min-h-20 resize-none" />
          </label>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em]">Materials</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {FURNITURE_MATERIALS.map((m) => <Button key={m} type="button" size="sm" variant={furnitureMaterials.includes(m) ? "default" : "outline"} onClick={() => setFurnitureMaterials((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m])}>{m}</Button>)}
            </div>
          </div>
        </div>}
      </div>}

      {/* Units */}
      <details className="organic-divider py-6">
        <summary className="flex cursor-pointer select-none items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em]">
          <span>Units</span>
          <span className="text-muted-foreground">drawing {planUnits === "meters" ? "m" : "ft/in"} · export {outputUnits}</span>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">Drawing units</p>
            <div className="flex rounded-xl border border-foreground p-1">
              <Button type="button" size="sm" variant={planUnits === "feet-inches" ? "default" : "ghost"} onClick={() => setPlanUnits("feet-inches")}>Feet</Button>
              <Button type="button" size="sm" variant={planUnits === "meters" ? "default" : "ghost"} onClick={() => setPlanUnits("meters")}>Meters</Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">Export units</p>
            <div className="flex rounded-xl border border-foreground p-1">
              <Button type="button" size="sm" variant={outputUnits === "feet" ? "default" : "ghost"} onClick={() => setOutputUnits("feet")}>Feet</Button>
              <Button type="button" size="sm" variant={outputUnits === "meters" ? "default" : "ghost"} onClick={() => setOutputUnits("meters")}>Meters</Button>
            </div>
          </div>
        </div>
      </details>

      {error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}

      {/* Build */}
      <Button variant="default" className="mt-5 h-12 w-full justify-between" disabled={!canBuild || busy}
        onClick={() => void (subject === "building" ? buildBuilding() : buildFurniture())}>
        <span>{busy ? "Building 3D model…" : subject === "building" ? `Build 3D model${floors.length ? ` from ${floors.length} floor${floors.length === 1 ? "" : "s"}` : ""}` : "Build 3D model"}</span>
        {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
      </Button>

      {/* Result */}
      {showResult && <div ref={previewRef} className="mt-8">
        {busy && <div className="rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-2 font-bold uppercase tracking-[0.14em]">
              <LoaderCircle className="size-4 animate-spin" />{status || "Building…"}
            </span>
            <span className="tabular-nums text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-foreground transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>}

        {subject === "building" && floorParts.length > 0 && <div className="mt-3"><Building3DViewer parts={floorParts} outputUnits={outputUnits} /></div>}

        {subject === "building" && buildReports.length > 0 && <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em]">Extraction report</p>
          {(() => {
            const totals = buildReports.reduce(
              (acc, r) => ({ confirmed: acc.confirmed + r.counts.confirmed, inferred: acc.inferred + r.counts.inferred, assumed: acc.assumed + r.counts.assumed }),
              { confirmed: 0, inferred: 0, assumed: 0 },
            );
            const tag = (label: string, items: string[]) => items.map((s) => buildReports.length > 1 ? `${label}: ${s}` : s);
            const assumptions = buildReports.flatMap((r) => tag(r.label, r.assumptions));
            const missing = buildReports.flatMap((r) => tag(r.label, r.missing));
            const conflicts = buildReports.flatMap((r) => tag(r.label, r.conflicts));
            const list = (title: string, items: string[]) => items.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.2em]">{title} ({items.length})</summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {items.map((item, i) => <li key={i}>• {item}</li>)}
                </ul>
              </details>
            );
            return <>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.14em]">
                <span className="rounded-full border border-border px-3 py-1">Confirmed {totals.confirmed}</span>
                <span className="rounded-full border border-border px-3 py-1">Inferred {totals.inferred}</span>
                <span className="rounded-full border border-border px-3 py-1">Assumed {totals.assumed}</span>
              </div>
              {list("Assumptions", assumptions)}
              {list("Missing information", missing)}
              {list("Conflicts", conflicts)}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {buildReports.map((r, i) => {
                  const suffix = buildReports.length > 1 ? `_${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` : "";
                  return <div key={i} className="contents">
                    {r.geometryJsonDataUrl && <Button variant="outline" size="sm" className="justify-between" onClick={() => downloadDataUrl(r.geometryJsonDataUrl!, `floorplan_geometry${suffix}.json`)}>
                      <span>Geometry JSON{buildReports.length > 1 ? ` — ${r.label}` : ""}</span><Download />
                    </Button>}
                    {r.reportMarkdownDataUrl && <Button variant="outline" size="sm" className="justify-between" onClick={() => downloadDataUrl(r.reportMarkdownDataUrl!, `floorplan_report${suffix}.md`)}>
                      <span>Report{buildReports.length > 1 ? ` — ${r.label}` : ""}</span><Download />
                    </Button>}
                  </div>;
                })}
              </div>
            </>;
          })()}
        </div>}
        {subject === "furniture" && (glb || dae) && <div className="mt-3"><Furniture3DPreview key={glb || dae || "x"} plan={plan ?? undefined} daeDataUrl={dae ?? undefined} glbDataUrl={glb ?? undefined} /></div>}

        {subject === "furniture" && (dae || glb || obj || fbx) && <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em]">Ready to download</p>
          <p className="mt-2 text-xs text-muted-foreground">Textured mesh · {outputUnits} · opens in SketchUp, Blender, Rhino, Maya, 3ds Max</p>
          <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em]">Format</p>
          <div className="mt-2 flex rounded-xl border border-foreground p-1">
            <Button type="button" size="sm" variant={downloadFormat === "fbx" ? "default" : "ghost"} className="flex-1" disabled={!fbx} onClick={() => setDownloadFormat("fbx")}>.fbx</Button>
            <Button type="button" size="sm" variant={downloadFormat === "obj" ? "default" : "ghost"} className="flex-1" disabled={!obj} onClick={() => setDownloadFormat("obj")}>.obj</Button>
            <Button type="button" size="sm" variant={downloadFormat === "dae" ? "default" : "ghost"} className="flex-1" disabled={!dae} onClick={() => setDownloadFormat("dae")}>.dae</Button>
          </div>
          <Button variant="default" className="mt-3 h-11 w-full justify-between" onClick={() => download(downloadFormat)}>
            <span>Download .{downloadFormat}</span><Download />
          </Button>
        </div>}
      </div>}

      <ToolInformation sections={information} />
    </section>
    <ToolTabBar />
    {calibrating !== null && floors[calibrating] && (
      <ScaleCalibrator
        imageDataUrl={floors[calibrating].imageDataUrl}
        label={floors[calibrating].label || "this floor"}
        planUnits={planUnits}
        onCalibrated={(planWidthMeters) => {
          setFloors((p) => p.map((x, j) => j === calibrating
            ? {
                ...x,
                planWidthMetersOverride: planWidthMeters,
                scaleSource: "user" as const,
                recognition: x.recognition ? { ...x.recognition, planWidthMeters } : x.recognition,
              }
            : x));
        }}
        onClose={() => setCalibrating(null)}
      />
    )}
    {recognitionPreview !== null && floors[recognitionPreview]?.recognition && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setRecognitionPreview(null)}>
        <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-black" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.14em]">AI recognition</h2>
              <p className="mt-0.5 text-[11px] text-neutral-600">{floors[recognitionPreview].recognition!.polygons.length} elements detected on {floors[recognitionPreview].label}</p>
            </div>
            <button onClick={() => setRecognitionPreview(null)} className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="relative flex-1 overflow-auto bg-neutral-100 p-3">
            <div className="relative mx-auto" style={{ width: "100%", aspectRatio: String(floors[recognitionPreview].recognition!.imageWidth / floors[recognitionPreview].recognition!.imageHeight) }}>
              <img src={floors[recognitionPreview].imageDataUrl} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
              <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                {floors[recognitionPreview].recognition!.polygons.map((poly) => {
                  const spec = MARK_LIFT_SPECS[poly.type];
                  return (
                    <polygon key={poly.id} points={poly.points.map(([x, y]) => `${x},${y}`).join(" ")}
                      fill={spec.hex} fillOpacity={0.45} stroke={spec.hex} strokeOpacity={0.95}
                      strokeWidth={0.003} vectorEffect="non-scaling-stroke" />
                  );
                })}
              </svg>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-neutral-200 px-4 py-3">
            {MARK_LIFT_TYPES.map((t) => {
              const spec = MARK_LIFT_SPECS[t];
              const count = floors[recognitionPreview]!.recognition!.polygons.filter((p) => p.type === t).length;
              if (count === 0) return null;
              return (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium">
                  <span className="h-3 w-3 rounded" style={{ background: spec.hex }} />
                  {spec.label} · {count}
                </span>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-neutral-200 p-3">
            <Button variant="outline" className="flex-1 rounded-full" onClick={() => { const i = recognitionPreview; setRecognitionPreview(null); void runRecognition(i); }}>Re-recognise</Button>
            <Button className="flex-1 rounded-full" onClick={() => setRecognitionPreview(null)}>Use for 3D build</Button>
          </div>
        </div>
      </div>
    )}
  </main>;
}