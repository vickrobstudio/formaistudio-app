import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Download, Eye, LoaderCircle, Plus, ScanSearch, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackLink, FormaHeader, PAGE_SHELL, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { ToolInformation, type ToolInfoSection } from "@/components/ToolInformation";
import { useCredits } from "@/hooks/use-credits";
import { generateFloor3D, extractFurnitureBounds, liftAnnotatedFloor, detectFloorElements, MARK_LIFT_SPECS, MARK_LIFT_TYPES, type MarkLiftType } from "@/lib/floor-3d.functions";
import { startMeshReconstruction, pollMeshReconstruction } from "@/lib/mesh-recon.functions";
import { Furniture3DPreview } from "@/components/Furniture3DPreview";
import { FloorAnnotator } from "@/components/FloorAnnotator";
import { Building3DViewer } from "@/components/Building3DViewer";
import type { FurniturePlan } from "@/lib/floor-3d-shared";

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
      "Furniture: top / front / side views with printed dimensions work best.",
      "Export: .fbx, .obj, or .dae — opens in SketchUp, Blender, Rhino, Maya, 3ds Max.",
    ],
  },
];

const CLIENT_TIMEOUT_MS = 1_800_000;
const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.88;

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
async function readDrawingSheets(file: File): Promise<Array<{ dataUrl: string; label: string }>> {
  if (isDwg(file) || isDxf(file)) {
    const { parseDrawing, rasterizeDatabase } = await import("@/lib/dwg-database");
    const db = await parseDrawing(file);
    const layouts = (db.layouts ?? []).filter((l) => !l.isModelSpace && l.entities.length > 0);
    if (layouts.length === 0) throw new Error("This DWG/DXF has no paper-space layouts to import. Open the file in CAD and publish each sheet to a layout tab first.");
    const out: Array<{ dataUrl: string; label: string }> = [];
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
};
type FloorPart = { index: number; label: string; daeDataUrl: string; objDataUrl: string; fbxDataUrl: string };

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
  const furnitureInputRef = useRef<HTMLInputElement>(null);

  // Result state
  const [stage, setStage] = useState<Stage>("upload");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [floorParts, setFloorParts] = useState<FloorPart[]>([]);
  const [dae, setDae] = useState<string | null>(null);
  const [obj, setObj] = useState<string | null>(null);
  const [fbx, setFbx] = useState<string | null>(null);
  const [glb, setGlb] = useState<string | null>(null);
  const [plan, setPlan] = useState<FurniturePlan | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"fbx" | "obj" | "dae">("fbx");
  const previewRef = useRef<HTMLDivElement>(null);
  const [recognitionPreview, setRecognitionPreview] = useState<number | null>(null);

  function reset() {
    setStage("upload"); setBusy(false); setProgress(0); setStatus(""); setError("");
    setFloorParts([]); setDae(null); setObj(null); setFbx(null); setGlb(null); setPlan(null);
  }

  function getImageSize(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
      img.onerror = () => reject(new Error("Could not read image dimensions."));
      img.src = src;
    });
  }

  async function runRecognition(index: number) {
    const f = floors[index];
    if (!f || !f.imageDataUrl.startsWith("data:image/")) return;
    setFloors((p) => p.map((x, j) => j === index ? { ...x, recognizing: true, recognizeError: undefined } : x));
    try {
      const { width, height } = await getImageSize(f.imageDataUrl);
      const result = await detect({ data: { imageDataUrl: f.imageDataUrl, imageWidth: width, imageHeight: height } });
      if (!result.ok) {
        setFloors((p) => p.map((x, j) => j === index ? { ...x, recognizing: false, recognizeError: result.error } : x));
        return;
      }
      const polygons: RecognizedPolygon[] = result.polygons.map((p, k) => ({
        id: p.id ?? `det_${k}`,
        type: p.type as MarkLiftType,
        points: p.points as Array<[number, number]>,
      }));
      setFloors((p) => p.map((x, j) => j === index ? {
        ...x,
        recognizing: false,
        recognition: { imageWidth: width, imageHeight: height, planWidthMeters: 12, polygons },
      } : x));
      setRecognitionPreview(index);
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
            heightMeters: 2.7,
            fileName: sheets.length > 1 ? `${file.name} — ${label}` : file.name,
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
    const unreviewed = floors.findIndex((floor) => !floor.recognition?.polygons.length);
    if (unreviewed !== -1) {
      setError("Review the 2D parts and confirm the plan scale for every floor before building.");
      setRecognitionPreview(unreviewed);
      return;
    }
    setBusy(true); setError(""); setFloorParts([]); setStage("modeling");
    if (!(await consume())) {
      setBusy(false); setStage("upload");
      if (!signedIn) { void navigate({ to: "/auth" }); return; }
      setError("You have no credits left. Open your Wallet to continue."); return;
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
                  planWidthMeters: f.recognition.planWidthMeters,
                  outputUnits,
                  wallHeightMeters: f.heightMeters || 2.7,
                  polygons: f.recognition.polygons.map((p: RecognizedPolygon) => ({ id: p.id, type: p.type, points: p.points })),
                },
              }), CLIENT_TIMEOUT_MS, `${label} took too long.`)
            : await withTimeout(generate({
                data: {
                  wallHeightMeters: f.heightMeters || 2.7,
                  planUnits, outputUnits, subject: "building",
                  building: {
                    scope: "floor",
                    floors: [{ imageDataUrl: f.imageDataUrl, label, heightMeters: f.heightMeters || 2.7 }],
                  },
                },
              }), CLIENT_TIMEOUT_MS, `${label} took too long.`);
          if (!result.ok) { firstError ||= result.error; continue; }
          const got = result.floorParts?.[0];
          if (!got) { firstError ||= `${label} returned no model.`; continue; }
          parts.push(got);
          setFloorParts([...parts]);
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
      if (!signedIn) { void navigate({ to: "/auth" }); return; }
      setError("You have no credits left. Open your Wallet to continue."); return;
    }
    try {
      let bounds: { width: number; depth: number; height: number } | undefined;
      try {
        const b = await fetchBounds({ data: { fileDataUrl: furnitureUrl, planUnits, referenceImages: [] } });
        if (b.ok) bounds = { width: b.width, depth: b.depth, height: b.height };
      } catch { /* fallback unscaled */ }

      setStatus("Reconstructing textured mesh — this takes 1–5 minutes…");
      const started = await startRecon({ data: { imageDataUrl: furnitureUrl, quality: "high" } });
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
    <div className={`${PAGE_SHELL} px-5 pt-7`}><BackLink /></div>
    <PageIntro eyebrow="2D to 3D" title="Plan to 3D model" description="Upload a floor plan or furniture drawing. Tap Build. Download the 3D file.">
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p>
    </PageIntro>

    <section className={`${PAGE_SHELL} px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:max-w-4xl`}>
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
                  <div className="flex items-center gap-1">
                    <Input type="number" min={1} max={50} step={0.25} inputMode="decimal" className="h-9 w-16"
                      value={Number((f.heightMeters * 3.28084).toFixed(2))}
                      onChange={(e) => { const v = Number(e.target.value) || 0; setFloors((p) => p.map((x, j) => j === i ? { ...x, heightMeters: Math.min(15, Math.max(0.3, v / 3.28084)) } : x)); }} />
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">ft</span>
                  </div>
                  {f.imageDataUrl.startsWith("data:image/") && (
                    <Button type="button" variant={f.recognition ? "default" : "outline"} size="sm" className="h-9 gap-1 px-2"
                      disabled={f.recognizing}
                      onClick={() => setRecognitionPreview(i)}
                      title="Select, draw and classify the parts to include in the 3D model">
                      {f.recognizing ? <LoaderCircle className="size-3 animate-spin" /> : f.recognition ? <Eye className="size-3" /> : <ScanSearch className="size-3" />}
                      <span className="text-[10px] font-bold uppercase">{f.recognizing ? "…" : f.recognition ? `${f.recognition.polygons.length}` : "Review 2D"}</span>
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
        {furnitureName && <Button type="button" variant="ghost" size="sm" onClick={() => { setFurnitureUrl(null); setFurnitureName(""); reset(); }}><X />Remove</Button>}
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
    {recognitionPreview !== null && floors[recognitionPreview] && (
      <FloorAnnotator
        key={recognitionPreview}
        imageDataUrl={floors[recognitionPreview].imageDataUrl}
        initialResult={floors[recognitionPreview].recognition}
        onClose={() => setRecognitionPreview(null)}
        onApply={(result) => {
          const index = recognitionPreview;
          setFloors((current) => current.map((floor, i) => i === index ? { ...floor, recognition: result } : floor));
          setRecognitionPreview(null);
          setFloorParts([]);
          setStage("upload");
        }}
      />
    )}
  </main>;
}