import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Check, Download, ImagePlus, LoaderCircle, Plus, RefreshCw, Sparkles, Upload, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { ToolInformation, type ToolInfoSection } from "@/components/ToolInformation";
import { useCredits } from "@/hooks/use-credits";
import { generateFloor3D, extractFurnitureBounds } from "@/lib/floor-3d.functions";
import { buildMasterPrompt } from "@/lib/floor-3d-prompt.functions";
import { startMeshReconstruction, pollMeshReconstruction } from "@/lib/mesh-recon.functions";
import { Furniture3DPreview } from "@/components/Furniture3DPreview";
import { Building3DViewer } from "@/components/Building3DViewer";
import type { FurniturePlan } from "@/lib/floor-3d-shared";
import { streamImage } from "@/lib/stream-image";

const information: ToolInfoSection[] = [
  {
    title: "How it works — Building",
    items: [
      "1 · Pick units (meters or feet & inches)",
      "2 · (Optional) Add a site plan to place the building on the ground",
      "3 · Add one floor plan per level, bottom → top — up to 2 images per floor (e.g. dimensioned + furnished)",
      "4 · Set the floor-to-floor height for each level",
      "5 · (Optional) Add roof plans and elevations (N / S / E / W) to lock heights and roof shape",
      "6 · Tap 'Build 3D model from drawings' — each floor is analysed and exported separately",
      "7 · Download one .dae / .obj / .fbx per floor with real-world dimensions",
    ],
  },
  {
    title: "How it works — Furniture",
    items: [
      "1 · Pick units (meters or feet & inches)",
      "2 · Upload a furniture drawing with top, front and side views and printed dimensions — a reference photo or render helps a lot",
      "3 · AI reads the views and reconstructs the 3D mesh at the printed scale",
      "4 · Live 3D preview opens in your browser — rotate, zoom, pan",
      "5 · Download .dae / .obj / .fbx scaled 1:1 so it imports at real size in SketchUp / Blender",
    ],
  },
  {
    title: "What to upload",
    items: [
      "Building: one floor plan per level (PDF, JPG, PNG, WEBP). Optional site plan, roof plans and elevations.",
      "Furniture: orthographic views (top + front + side) with printed dimensions, plus an optional reference photo or render.",
      "Each file up to 40 MB.",
    ],
  },
  {
    title: "Output",
    items: [
      "Direct 3D downloads — no live preview step for buildings",
      "Collada .dae · OBJ · FBX — Z-up, units of your choice",
      "Buildings: one group per floor (Ground floor, Floor 1, Roof) so SketchUp / Blender shows separate layers",
      "Furniture: scaled 1:1 to the drawing so dimensions match in SketchUp",
    ],
  },
];

type Stage = "upload" | "prompted" | "rendered" | "modeling" | "ready";

// Per user request: NO TIME LIMIT for 3D model creation. The client guard is
// effectively disabled (30 minutes) so the server can take as long as needed.
const BUILDING_CLIENT_FLOOR_TIMEOUT_MS = 1_800_000;
const BUILDING_IMAGE_MAX_DIMENSION = 2400;
const BUILDING_IMAGE_JPEG_QUALITY = 0.88;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function readRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
    r.onerror = () => reject(new Error("Could not read file."));
    r.readAsDataURL(file);
  });
}

export function FloorTo3D() {
  const fileRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [isPdf, setIsPdf] = useState(false);
  const [subject, setSubject] = useState<"building" | "furniture">("building");
  const [planUnits, setPlanUnits] = useState<"meters" | "feet-inches">("meters");
  const [outputUnits, setOutputUnits] = useState<"meters" | "feet">("meters");
  const [heightMeters, setHeightMeters] = useState("2.7");
  const [heightFeet, setHeightFeet] = useState("9");
  const [heightInches, setHeightInches] = useState("0");
  const [stage, setStage] = useState<Stage>("upload");
  const [busy, setBusy] = useState<"" | "prompt" | "render" | "model">("");
  const [error, setError] = useState("");
  const [masterPrompt, setMasterPrompt] = useState("");
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderFinal, setRenderFinal] = useState(false);
  const [dae, setDae] = useState<string | null>(null);
  const [glb, setGlb] = useState<string | null>(null);
  const [obj, setObj] = useState<string | null>(null);
  const [fbx, setFbx] = useState<string | null>(null);
  const [quality, setQuality] = useState<"low" | "high">("high");
  const [downloadFormat, setDownloadFormat] = useState<"fbx" | "obj" | "dae">("fbx");
  const [reconStatus, setReconStatus] = useState("");
  const [modelProgress, setModelProgress] = useState(0);
  const [plan, setPlan] = useState<FurniturePlan | null>(null);
  const [summary, setSummary] = useState<{ count: number; subject: "building" | "furniture"; outputUnits: "meters" | "feet" } | null>(null);
  const [floorParts, setFloorParts] = useState<Array<{
    index: number;
    label: string;
    daeDataUrl: string;
    objDataUrl: string;
    fbxDataUrl: string;
  }>>([]);
  const { credits, signedIn, vip, consume } = useCredits();
  const navigate = useNavigate();
  const generate = useServerFn(generateFloor3D);
  const writePrompt = useServerFn(buildMasterPrompt);
  const startRecon = useServerFn(startMeshReconstruction);
  const pollRecon = useServerFn(pollMeshReconstruction);
  const fetchFurnitureBounds = useServerFn(extractFurnitureBounds);

  // Multi-image building flow — one image per floor, optional roof plan,
  // multiple elevations. When the user uses this flow we skip the master
  // prompt + approval render and build the 3D model straight from drawings.
  type FloorEntry = { imageDataUrl: string; imageDataUrl2?: string; label: string; heightMeters: number; heightUnit: "m" | "ft"; fileName: string; fileName2?: string };
  type ElevationEntry = { imageDataUrl: string; facing: "N" | "S" | "E" | "W" | "other"; label: string; fileName: string };
  const [floors, setFloors] = useState<FloorEntry[]>([]);
  const [roofPlans, setRoofPlans] = useState<Array<{ imageDataUrl: string; fileName: string }>>([]);
  const [sitePlan, setSitePlan] = useState<{ imageDataUrl: string; fileName: string } | null>(null);
  const [elevations, setElevations] = useState<ElevationEntry[]>([]);
  const floorInputRef = useRef<HTMLInputElement>(null);
  const floorInputIndex = useRef<number>(-1);
  const floorInputSlot = useRef<1 | 2>(1);
  const roofInputRef = useRef<HTMLInputElement>(null);
  const siteInputRef = useRef<HTMLInputElement>(null);
  const elevationInputRef = useRef<HTMLInputElement>(null);

  function readFileAsDataUrl(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) return readRawDataUrl(file);
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;
          const scale = Math.min(1, BUILDING_IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
          const width = Math.max(1, Math.round(sourceWidth * scale));
          const height = Math.max(1, Math.round(sourceHeight * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Could not optimize image.");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", BUILDING_IMAGE_JPEG_QUALITY));
        } catch (cause) {
          reject(cause instanceof Error ? cause : new Error("Could not optimize image."));
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read image."));
      };
      image.src = objectUrl;
    });
  }

  async function addFloor() {
    floorInputIndex.current = -1;
    floorInputSlot.current = 1;
    floorInputRef.current?.click();
  }
  async function replaceFloor(index: number) {
    floorInputIndex.current = index;
    floorInputSlot.current = 1;
    floorInputRef.current?.click();
  }
  async function pickFloorImage2(index: number) {
    floorInputIndex.current = index;
    floorInputSlot.current = 2;
    floorInputRef.current?.click();
  }
  async function onFloorPicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 40_000_000) { setError("Each drawing must be under 40 MB."); return; }
    const url = await readFileAsDataUrl(file);
    const idx = floorInputIndex.current;
    const slot = floorInputSlot.current;
    if (idx >= 0) {
      setFloors((prev) => prev.map((f, i) => i === idx
        ? (slot === 2 ? { ...f, imageDataUrl2: url, fileName2: file.name } : { ...f, imageDataUrl: url, fileName: file.name })
        : f));
    } else {
      setFloors((prev) => [...prev, {
        imageDataUrl: url,
        label: prev.length === 0 ? "Ground floor" : `Floor ${prev.length}`,
        heightMeters: 2.7,
        heightUnit: prev[prev.length - 1]?.heightUnit ?? "m",
        fileName: file.name,
      }]);
    }
    setError("");
  }
  async function onRoofPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (files.some((file) => file.size > 40_000_000)) { setError("Each drawing must be under 40 MB."); return; }
    const added: Array<{ imageDataUrl: string; fileName: string }> = [];
    for (const file of files) {
      const url = await readFileAsDataUrl(file);
      added.push({ imageDataUrl: url, fileName: file.name });
    }
    setRoofPlans((prev) => [...prev, ...added].slice(0, 6));
    setError("");
  }
  async function onSitePicked(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 40_000_000) { setError("Each drawing must be under 40 MB."); return; }
    const url = await readFileAsDataUrl(file);
    setSitePlan({ imageDataUrl: url, fileName: file.name });
    setError("");
  }
  async function onElevationsPicked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (files.some((file) => file.size > 40_000_000)) { setError("Each drawing must be under 40 MB."); return; }
    const cycle: ElevationEntry["facing"][] = ["N", "E", "S", "W", "other"];
    const added: ElevationEntry[] = [];
    for (const file of files) {
      const url = await readFileAsDataUrl(file);
      const facing = cycle[(elevations.length + added.length) % cycle.length];
      added.push({ imageDataUrl: url, facing, label: "", fileName: file.name });
    }
    setElevations((prev) => [...prev, ...added].slice(0, 8));
    setError("");
  }

  async function buildFromDrawings() {
    if (floors.length === 0) { setError("Add at least one floor plan."); return; }
    setBusy("model"); setError(""); setDae(null); setGlb(null); setObj(null); setFbx(null); setFloorParts([]); setStage("modeling");
    if (!(await consume())) {
      setBusy(""); setStage("upload");
      if (!signedIn) { void navigate({ to: "/auth" }); return; }
      setError("You have no credits left. Open your Wallet to continue."); return;
    }
    try {
      const parts: Array<{ index: number; label: string; daeDataUrl: string; objDataUrl: string; fbxDataUrl: string }> = [];
      let totalElements = 0;
      let firstError = "";

      // Ordered sequence: SITE → FLOOR 1 → FLOOR 2 → … → ROOF.
      // Each step is its own server call and produces its own downloadable
      // file. 100% fidelity per piece — the AI reads only the drawings for
      // the part it is building.
      type Step =
        | { kind: "site" }
        | { kind: "floor"; index: number }
        | { kind: "roof" };
      const steps: Step[] = [];
      if (sitePlan) steps.push({ kind: "site" });
      for (let i = 0; i < floors.length; i += 1) steps.push({ kind: "floor", index: i });
      const hasRoofData = roofPlans.length > 0 || elevations.length > 0;
      if (hasRoofData) steps.push({ kind: "roof" });

      const topIndex = floors.length - 1;

      for (let s = 0; s < steps.length; s += 1) {
        const step = steps[s];
        const stepLabel = step.kind === "site" ? "Site" : step.kind === "roof" ? "Roof" : (floors[step.index].label?.trim() || (step.index === 0 ? "Ground floor" : `Floor ${step.index}`));
        setReconStatus(`Building ${stepLabel} (${s + 1}/${steps.length})…`);

        const floorForBounds = step.kind === "site" ? floors[0] : step.kind === "roof" ? floors[topIndex] : floors[step.index];
        const scope: "site" | "floor" | "roof" = step.kind;

        try {
          const result = await withTimeout(generate({
            data: {
              wallHeightMeters: floorForBounds.heightMeters || 2.7,
              planUnits,
              outputUnits,
              subject: "building",
              building: {
                scope,
                floors: [{
                  imageDataUrl: floorForBounds.imageDataUrl,
                  imageDataUrl2: floorForBounds.imageDataUrl2,
                  label: floorForBounds.label,
                  heightMeters: floorForBounds.heightMeters,
                }],
                roof: step.kind === "roof" && roofPlans.length ? roofPlans.map((r) => ({ imageDataUrl: r.imageDataUrl })) : undefined,
                site: step.kind === "site" && sitePlan ? { imageDataUrl: sitePlan.imageDataUrl } : undefined,
                elevations: step.kind === "roof" ? elevations.map((e) => ({ imageDataUrl: e.imageDataUrl, facing: e.facing, label: e.label || undefined })) : [],
              },
            },
          }), BUILDING_CLIENT_FLOOR_TIMEOUT_MS, `${stepLabel} analysis took too long. Try a clearer cropped image.`);

          if (!result.ok) { firstError ||= result.error; continue; }

          const got = result.floorParts?.[0];
          if (!got) { firstError ||= `${stepLabel} returned no model.`; continue; }
          parts.push(got);
          totalElements += result.elementCount;
          setFloorParts([...parts]);
          setSummary({ count: totalElements, subject: "building", outputUnits });
        } catch (cause) {
          firstError ||= cause instanceof Error ? cause.message : `${stepLabel} analysis failed.`;
          continue;
        }
      }

      if (parts.length === 0) { setError(firstError || "The drawings could not be analysed. Try clearer images with visible dimensions."); setStage("upload"); return; }
      if (firstError) setError(`Some parts could not be analysed. ${parts.length} model${parts.length === 1 ? "" : "s"} ready.`);
      setDae(null);
      setObj(null);
      setFbx(null);
      setFloorParts(parts);
      setSummary({ count: totalElements, subject: "building", outputUnits });
      setStage("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The 3D model could not be generated.");
      setStage("upload");
    } finally { setBusy(""); setReconStatus(""); }
  }

  useEffect(() => {
    if ((stage === "modeling" || stage === "ready") && previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [stage, dae]);

  // Time-based progress bar for 3D model creation. The server fn is a single
  // blocking call, so we ease toward 95% over ~45s while busy="model" and
  // snap to 100% the moment a .dae or .glb is ready.
  useEffect(() => {
    if (busy !== "model") { setModelProgress(0); return; }
    setModelProgress(2);
    const started = Date.now();
    // Furniture uses a higher-fidelity (slower) model; mesh recon is slowest.
    const target = glb ? 240_000 : subject === "furniture" ? 90_000 : 45_000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - started;
      // Asymptotic ease toward 95%
      const pct = Math.min(95, 100 * (1 - Math.exp(-elapsed / (target * 0.4))));
      setModelProgress(pct);
    }, 250);
    return () => clearInterval(interval);
  }, [busy, glb, subject]);

  useEffect(() => {
    if ((dae || glb) && stage === "ready") setModelProgress(100);
  }, [dae, glb, stage]);

  // Buildings skip the live 3D viewer — the user downloads each floor model.

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000_000) { setError("Use a file smaller than 2 GB."); return; }
    setError("");
    setFileName(file.name);
    setIsPdf(file.type === "application/pdf");
    setStage("upload");
    setMasterPrompt("");
    setRenderUrl(null);
    setRenderFinal(false);
    setDae(null);
    setGlb(null);
    setObj(null);
    setFbx(null);
    setPlan(null);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setFileDataUrl(reader.result); };
    reader.readAsDataURL(file);
  }

  function clearFile() {
    setFileName("");
    setFileDataUrl(null);
    setReferenceImages([]);
    setStage("upload");
    setMasterPrompt("");
    setRenderUrl(null);
    setRenderFinal(false);
    setDae(null);
    setGlb(null);
    setObj(null);
    setFbx(null);
    setReconStatus("");
    setPlan(null);
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function generatePrompt() {
    if (!fileDataUrl) return;
    setBusy("prompt"); setError("");
    try {
      const result = await writePrompt({ data: { fileDataUrl, subject, referenceImages } });
      if (!result.ok) { setError(result.error); return; }
      setMasterPrompt(result.prompt);
      setStage("prompted");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The master prompt could not be created.");
    } finally { setBusy(""); }
  }

  async function renderPreview() {
    if (!masterPrompt.trim()) return;
    setBusy("render"); setError("");
    setRenderUrl(null); setRenderFinal(false);
    try {
      const noDimensionsDirective = "\n\nCRITICAL — CLEAN PHOTOREAL OUTPUT: The rendered image MUST NOT contain any dimensions, measurement annotations, dimension lines, leader lines, arrows, rulers, scale bars, tick marks, callouts, labels, numbers, units (mm, cm, m, ft, in), text overlays, watermarks, logos, grids, axis indicators, or any drafting markup whatsoever. Render ONLY the finished photoreal object/scene as a real-world photograph — no annotations of any kind.";
      const finalPrompt = `${masterPrompt}${noDimensionsDirective}`;
      await streamImage(finalPrompt, fileDataUrl, (src, isFinal) => {
        setRenderUrl(src);
        if (isFinal) { setRenderFinal(true); setStage("rendered"); }
      }, referenceImages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The rendering could not be created.");
    } finally { setBusy(""); }
  }

  async function approveAndBuild() {
    if (!renderUrl) return;
    // For furniture, the only way to achieve 100% fidelity to the approved
    // rendering is true image-to-3D mesh reconstruction (Trellis). Primitive
    // extraction can never match an organic/curved silhouette exactly, so we
    // route furniture straight to the mesh reconstructor.
    if (subject === "furniture") {
      await reconstructMesh();
      return;
    }
    // The approved rendering IS the source of geometry for the 3D model.
    // The 2D plan was only used to author the rendering.
    await buildModel(renderUrl, undefined, renderUrl);
  }

  async function buildFromReferenceRendering() {
    const reference = referenceImages[0];
    if (!reference || !fileDataUrl) return;
    if (subject === "furniture") {
      setMasterPrompt("");
      setRenderUrl(reference);
      setRenderFinal(true);
      await reconstructMesh(reference);
      return;
    }
    // The reference rendering IS the geometry/material source for the live 3D
    // preview and .dae. The required 2D plan only unlocks this workflow.
    setMasterPrompt("");
    setRenderUrl(reference);
    setRenderFinal(true);
    await buildModel(reference, undefined, reference);
  }

  async function buildModel(approvedRenderUrl: string | undefined, prompt: string | undefined, source: string) {
    const rawMeters = planUnits === "meters"
      ? Number(heightMeters) || 2.7
      : ((Number(heightFeet) || 0) * 0.3048) + ((Number(heightInches) || 0) * 0.0254);
    const wallHeightMeters = Math.min(10, Math.max(1, rawMeters));
    setBusy("model"); setError(""); setDae(null); setPlan(null); setStage("modeling");
    if (!(await consume())) {
      setBusy("");
      setStage("rendered");
      if (!signedIn) { void navigate({ to: "/auth" }); return; }
      setError("You have no credits left. Open your Wallet to continue."); return;
    }
    try {
      const result = await generate({
        data: {
          fileDataUrl: source,
          wallHeightMeters,
          planUnits,
          outputUnits,
          subject,
          approvedRenderUrl,
          masterPrompt: prompt,
          // Only set referenceOnly when there's no separate 2D plan
          // (source equals the rendering itself).
          referenceOnly: Boolean(approvedRenderUrl && source === approvedRenderUrl),
          referenceImages,
        },
      });
      if (!result.ok) { setError(result.error); return; }
      setDae(result.daeDataUrl);
      setObj(result.objDataUrl);
      setFbx(result.fbxDataUrl);
      setSummary({ count: result.elementCount, subject: result.subject, outputUnits: result.outputUnits });
      if (result.plan.kind === "furniture") setPlan(result.plan as FurniturePlan);
      setStage("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The 3D file could not be generated.");
    } finally { setBusy(""); }
  }

  function download(format: "dae" | "obj" | "fbx" | "glb") {
    const map: Record<typeof format, string | null> = { dae, obj, fbx, glb };
    const href = map[format];
    if (!href) return;
    const baseName = (fileName.replace(/\.[^.]+$/, "") || (subject === "furniture" ? "furniture" : "floorplan"));
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `${baseName}.${format}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function downloadHref(href: string, filename: string) {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  // Per-part building downloads are now handled inside <Building3DViewer />
  // so the user can recolour / hide groups before exporting.

  async function reconstructMesh(urlOverride?: string) {
    const source = urlOverride ?? renderUrl;
    if (!source) return;
    setBusy("model"); setError(""); setDae(null); setGlb(null); setObj(null); setFbx(null); setStage("modeling");
    setReconStatus("Reading dimensions from your 2D drawing…");
    if (!(await consume())) {
      setBusy(""); setStage("rendered");
      if (!signedIn) { void navigate({ to: "/auth" }); return; }
      setError("You have no credits left. Open your Wallet to continue."); return;
    }
    try {
      // For furniture, the mesh reconstructor returns a normalised unit-cube
      // mesh. Read printed dimensions from the 2D technical sheet first so the
      // downloaded .dae opens at 1:1 scale in SketchUp / Blender. Falls back
      // silently if extraction fails (we still produce a model, just not scaled).
      let furnitureBounds: { width: number; depth: number; height: number } | undefined =
        plan?.bounds ? { width: plan.bounds.width, depth: plan.bounds.depth, height: plan.bounds.height } : undefined;
      if (subject === "furniture" && !furnitureBounds && fileDataUrl) {
        try {
          const b = await fetchFurnitureBounds({
            data: { fileDataUrl, planUnits, referenceImages },
          });
          if (b.ok) furnitureBounds = { width: b.width, depth: b.depth, height: b.height };
        } catch { /* keep unscaled fallback */ }
      }
      setReconStatus("Uploading rendering to mesh reconstructor…");
      // Render data URLs may be remote URLs from the streaming image; fetch to data URL first.
      let imageDataUrl = source;
      if (!imageDataUrl.startsWith("data:")) {
        const res = await fetch(imageDataUrl);
        const blob = await res.blob();
        imageDataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
          r.onerror = () => reject(new Error("Could not read rendering."));
          r.readAsDataURL(blob);
        });
      }
      const started = await startRecon({ data: { imageDataUrl, quality } });
      if (!started.ok) { setError(started.error); setStage("rendered"); return; }
      setReconStatus("Reconstructing textured mesh — this takes 1–5 minutes…");
      const predictionId = started.predictionId;
      const deadline = Date.now() + 10 * 60 * 1000;
      // Poll loop
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() > deadline) { setError("Reconstruction timed out after 10 minutes."); setStage("rendered"); return; }
        await new Promise((r) => setTimeout(r, 6000));
        const polled = await pollRecon({
          data: {
            predictionId,
            outputUnits,
            // Pass the real-world bounds parsed from the 2D plan so the
            // downloaded .dae has the exact width/depth/height the user
            // typed in — not Trellis's normalised unit-cube output.
            targetBoundsMeters: furnitureBounds,
          },
        });
        if (!polled.ok) { setError(polled.error); setStage("rendered"); return; }
        if (polled.status && polled.status !== "succeeded") {
          setReconStatus(`Reconstructing textured mesh — status: ${polled.status}…`);
          continue;
        }
        if (polled.glbDataUrl) {
          setGlb(polled.glbDataUrl);
          if (polled.daeDataUrl) setDae(polled.daeDataUrl);
          if (polled.objDataUrl) setObj(polled.objDataUrl);
          if (polled.fbxDataUrl) setFbx(polled.fbxDataUrl);
          setSummary({ count: 1, subject, outputUnits });
          setStage("ready");
          setReconStatus("");
          return;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Mesh reconstruction failed.");
      setStage("rendered");
    } finally {
      setBusy("");
    }
  }

  const stepHeading = (n: number, label: string, active: boolean, done: boolean) =>
    <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] ${active ? "text-foreground" : done ? "text-foreground/60" : "text-muted-foreground"}`}>
      <span className={`flex size-5 items-center justify-center rounded-full border ${done ? "border-foreground bg-foreground text-background" : active ? "border-foreground" : "border-border"}`}>{done ? <Check className="size-3" /> : n}</span>
      {label}
    </div>;
  const hasFloorExports = floorParts.length > 0;
  const showLivePreview = stage === "modeling" || stage === "ready" || Boolean(dae) || Boolean(glb) || hasFloorExports;

  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink /></div>
    <PageIntro eyebrow="2D to 3D" title="2D plan to 3D model" description="Upload a fully dimensioned floor plan or furniture drawing. AI reads every printed dimension and exports an editable Collada .dae model in the units you choose.">
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p>
    </PageIntro>
    <section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {/* Step 1 — Upload */}
      {stepHeading(1, "Upload drawing", stage === "upload", stage !== "upload")}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">What are you uploading?</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button type="button" variant={subject === "building" ? "default" : "outline"} onClick={() => setSubject("building")}>Building / floor plan</Button>
          <Button type="button" variant={subject === "furniture" ? "default" : "outline"} onClick={() => setSubject("furniture")}>Furniture piece</Button>
        </div>
      </div>
      {subject === "building" && <>
        <input ref={floorInputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={onFloorPicked} />
        <input ref={roofInputRef} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={onRoofPicked} />
        <input ref={siteInputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={onSitePicked} />
        <input ref={elevationInputRef} type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={onElevationsPicked} />

        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Site plan (optional)</p>
        <p className="mt-2 text-xs text-muted-foreground">A top-down view of the site — property lines, setbacks, driveway, landscaping. Used to place the building on the ground.</p>
        {sitePlan ? <div className="mt-3 rounded-2xl border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Site</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSitePlan(null)}><X className="size-3" />Remove</Button>
          </div>
          <button type="button" onClick={() => siteInputRef.current?.click()} className="mt-2 block aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-secondary">
            {sitePlan.imageDataUrl.startsWith("data:image/") ? <img src={sitePlan.imageDataUrl} alt="Site plan" className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-muted-foreground">{sitePlan.fileName}</span>}
          </button>
        </div> : <Button type="button" variant="outline" className="mt-3 h-12 w-full justify-between" onClick={() => siteInputRef.current?.click()}><span>Add site plan</span><Plus /></Button>}

        <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.2em]">Floors — bottom → top (up to 2 images per floor)</p>
        <p className="mt-2 text-xs text-muted-foreground">Upload each floor plan separately so the 3D model stacks them in real-world order. You can add a second drawing per floor (e.g. furnished plan, RCP, or a dimensioned variant). Set the floor-to-floor height for each level.</p>
        <div className="mt-3 space-y-3">
          {floors.map((floor, index) => <div key={index} className="rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Floor {index}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFloors((prev) => prev.filter((_, i) => i !== index))}><X className="size-3" />Remove</Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void replaceFloor(index)} className="block aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-secondary">
                {floor.imageDataUrl.startsWith("data:image/") ? <img src={floor.imageDataUrl} alt={floor.label} className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-muted-foreground">{floor.fileName}</span>}
              </button>
              {floor.imageDataUrl2 ? <div className="relative">
                <button type="button" onClick={() => void pickFloorImage2(index)} className="block aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-secondary">
                  {floor.imageDataUrl2.startsWith("data:image/") ? <img src={floor.imageDataUrl2} alt={`${floor.label} second drawing`} className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-muted-foreground">{floor.fileName2}</span>}
                </button>
                <button type="button" aria-label="Remove second drawing" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-background/90 text-foreground" onClick={() => setFloors((prev) => prev.map((f, i) => i === index ? { ...f, imageDataUrl2: undefined, fileName2: undefined } : f))}><X className="size-3" /></button>
              </div> : <button type="button" onClick={() => void pickFloorImage2(index)} className="grid aspect-[4/3] w-full place-items-center rounded-xl border border-dashed border-border bg-secondary/40 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <span className="flex flex-col items-center gap-1"><Plus className="size-4" />Add 2nd image</span>
              </button>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-[10px] uppercase tracking-[0.18em]">Label
                <Input value={floor.label} onChange={(event) => setFloors((prev) => prev.map((f, i) => i === index ? { ...f, label: event.target.value } : f))} className="mt-1 h-10" />
              </label>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.18em]">Floor height</span>
                  <div className="flex overflow-hidden rounded-md border border-border">
                    {(["m", "ft"] as const).map((u) => <button key={u} type="button" onClick={() => setFloors((prev) => prev.map((f, i) => i === index ? { ...f, heightUnit: u } : f))} className={`px-2 py-0.5 text-[10px] font-bold uppercase ${floor.heightUnit === u ? "bg-foreground text-background" : "bg-background text-foreground"}`}>{u}</button>)}
                  </div>
                </div>
                <Input type="number" min={floor.heightUnit === "ft" ? 1 : 0.3} max={floor.heightUnit === "ft" ? 50 : 15} step={floor.heightUnit === "ft" ? 0.25 : 0.1} inputMode="decimal" value={floor.heightUnit === "ft" ? Number((floor.heightMeters * 3.28084).toFixed(2)) : floor.heightMeters} onChange={(event) => { const raw = Number(event.target.value); const v = Number.isFinite(raw) && raw > 0 ? raw : 0; const meters = floor.heightUnit === "ft" ? v / 3.28084 : v; const clamped = Math.min(15, Math.max(0.3, meters || 2.7)); setFloors((prev) => prev.map((f, i) => i === index ? { ...f, heightMeters: clamped } : f)); }} className="mt-1 h-10" />
              </div>
            </div>
          </div>)}
          <Button type="button" variant="outline" className="h-12 w-full justify-between" onClick={() => void addFloor()} disabled={floors.length >= 10}>
            <span>{floors.length === 0 ? "Add ground floor plan" : `Add floor ${floors.length}`}</span><Plus />
          </Button>
        </div>

        <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.2em]">Roof plans (optional)</p>
        <p className="mt-2 text-xs text-muted-foreground">Top-down views of the roof. You can add multiple (e.g. structural plan, finish plan, drainage). Used together with the elevations to set the roof outline.</p>
        {roofPlans.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {roofPlans.map((roof, index) => <div key={index} className="rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Roof {index + 1}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRoofPlans((prev) => prev.filter((_, i) => i !== index))}><X className="size-3" />Remove</Button>
            </div>
            <div className="mt-2 block aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-secondary">
              {roof.imageDataUrl.startsWith("data:image/") ? <img src={roof.imageDataUrl} alt={`Roof plan ${index + 1}`} className="size-full object-contain" /> : <span className="grid size-full place-items-center text-xs text-muted-foreground">{roof.fileName}</span>}
            </div>
          </div>)}
        </div>}
        <Button type="button" variant="outline" className="mt-3 h-12 w-full justify-between" onClick={() => roofInputRef.current?.click()} disabled={roofPlans.length >= 6}>
          <span>{roofPlans.length === 0 ? "Add roof plan" : `Add another roof plan (${roofPlans.length}/6)`}</span><Plus />
        </Button>

        <p className="mt-8 text-[10px] font-bold uppercase tracking-[0.2em]">Elevations</p>
        <p className="mt-2 text-xs text-muted-foreground">Add one image per facade (North, South, East, West). Used to lock heights, window positions and roof shape.</p>
        {elevations.length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {elevations.map((elev, index) => <div key={index} className="rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Elevation</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setElevations((prev) => prev.filter((_, i) => i !== index))}><X className="size-3" />Remove</Button>
            </div>
            {elev.imageDataUrl.startsWith("data:image/") ? <img src={elev.imageDataUrl} alt={`Elevation ${elev.facing}`} className="mt-2 aspect-[4/3] w-full rounded-xl border border-border bg-secondary object-contain" /> : <div className="mt-2 grid aspect-[4/3] w-full place-items-center rounded-xl border border-border bg-secondary text-xs text-muted-foreground">{elev.fileName}</div>}
            <div className="mt-2 flex gap-1">
              {(["N", "E", "S", "W", "other"] as const).map((dir) => <Button key={dir} type="button" size="sm" variant={elev.facing === dir ? "default" : "outline"} className="flex-1" onClick={() => setElevations((prev) => prev.map((e, i) => i === index ? { ...e, facing: dir } : e))}>{dir}</Button>)}
            </div>
          </div>)}
        </div>}
        <Button type="button" variant="outline" className="mt-3 h-12 w-full justify-between" onClick={() => elevationInputRef.current?.click()} disabled={elevations.length >= 8}>
          <span>{elevations.length === 0 ? "Add elevations" : `Add more elevations (${elevations.length}/8)`}</span><Plus />
        </Button>
      </>}

      {subject === "furniture" && <>
      <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={upload} />
      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="relative min-h-56 w-full overflow-hidden rounded-2xl p-0">
        {fileDataUrl && !isPdf
          ? <img src={fileDataUrl} alt={`Uploaded ${subject === "furniture" ? "furniture drawing" : "floor plan"}`} className="max-h-[70vh] w-full object-contain" />
          : <span className="px-6 text-center">
              <Upload className="mx-auto size-6" />
              <span className="mt-3 block text-sm font-bold">{fileName || (subject === "furniture" ? "Upload your furniture drawing" : "Upload your floor plan")}</span>
              <span className="mt-1 block text-xs text-muted-foreground">PDF, JPG or PNG · up to 2 GB</span>
            </span>}
      </Button>
      {fileName && <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={clearFile}><X />Remove file</Button>}

      {/* Optional reference photos — drive the master prompt's shape fidelity */}
      <div className="mt-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Reference photos (optional)</p>
        <p className="mt-2 text-xs text-muted-foreground">Add up to 6 inspiration / shape reference images. AI will match the silhouette of the references and the dimensions of your drawing.</p>
        <input ref={referenceRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => {
          const files = Array.from(event.target.files ?? []).slice(0, 6);
          if (files.some((file) => file.size > 8_000_000)) { setError("Each reference must be smaller than 8 MB."); return; }
          setError("");
          Promise.all(files.map((file) => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.readAsDataURL(file);
          }))).then((images) => setReferenceImages(images.filter(Boolean).slice(0, 6)));
        }} />
        <Button type="button" variant="outline" className="mt-3 h-12 w-full justify-between" onClick={() => referenceRef.current?.click()}>
          <span>{referenceImages.length ? `${referenceImages.length} reference${referenceImages.length === 1 ? "" : "s"} attached` : "Add reference photos"}</span>
          <ImagePlus />
        </Button>
        {referenceImages.length > 0 && <div className="mt-3 grid grid-cols-3 gap-2">
          {referenceImages.map((image, index) => <div key={index} className="relative overflow-hidden rounded-xl border border-border">
            <img src={image} alt={`Reference ${index + 1}`} className="aspect-square w-full object-cover" />
            <button type="button" aria-label="Remove reference" className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-background/90 text-foreground" onClick={() => setReferenceImages((current) => current.filter((_, i) => i !== index))}><X className="size-3" /></button>
          </div>)}
        </div>}
        {referenceImages.length > 0 && stage !== "modeling" && stage !== "ready" && <div className="mt-4 rounded-2xl border border-dashed border-foreground/40 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Plan + reference rendering detected</p>
          <p className="mt-2 text-xs text-muted-foreground">{fileDataUrl ? "Skipping prompt and approval render. The live 3D preview and .dae are reconstructed from your reference rendering at 100% fidelity, with matching materials and groups." : "Upload your 2D plan above to unlock direct 3D reconstruction."}</p>
          <Button variant="default" className="mt-3 h-12 w-full justify-between" disabled={busy !== "" || !fileDataUrl} onClick={() => void buildFromReferenceRendering()}>
            <span>{busy === "model" ? "Reconstructing live preview…" : "Build live 3D from rendering"}</span>
            {busy === "model" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          </Button>
        </div>}
      </div>
      </>}

      <div className="organic-divider py-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Drawing units</p>
            <p className="mt-2 text-xs text-muted-foreground">Units printed on your source drawing</p>
          </div>
          <div className="flex rounded-xl border border-foreground p-1">
            <Button type="button" size="sm" variant={planUnits === "feet-inches" ? "default" : "ghost"} onClick={() => setPlanUnits("feet-inches")}>Feet & inches</Button>
            <Button type="button" size="sm" variant={planUnits === "meters" ? "default" : "ghost"} onClick={() => setPlanUnits("meters")}>Meters</Button>
          </div>
        </div>
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]">.dae output units</p>
            <p className="mt-2 text-xs text-muted-foreground">Units the exported 3D file will use</p>
          </div>
          <div className="flex rounded-xl border border-foreground p-1">
            <Button type="button" size="sm" variant={outputUnits === "feet" ? "default" : "ghost"} onClick={() => setOutputUnits("feet")}>Feet</Button>
            <Button type="button" size="sm" variant={outputUnits === "meters" ? "default" : "ghost"} onClick={() => setOutputUnits("meters")}>Meters</Button>
          </div>
        </div>
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Model detail</p>
            <p className="mt-2 text-xs text-muted-foreground">High poly = fine geometric detail. Low poly = lighter mesh, fast loading, game-engine ready.</p>
          </div>
          <div className="flex rounded-xl border border-foreground p-1">
            <Button type="button" size="sm" variant={quality === "low" ? "default" : "ghost"} onClick={() => setQuality("low")}>Low poly</Button>
            <Button type="button" size="sm" variant={quality === "high" ? "default" : "ghost"} onClick={() => setQuality("high")}>High poly</Button>
          </div>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 text-xs text-destructive">{error}</p>}

      {subject === "building" && <Button variant="default" className="mt-6 h-12 w-full justify-between" disabled={busy !== "" || floors.length === 0 || stage === "modeling" || stage === "ready"} onClick={() => void buildFromDrawings()}>
        <span>{busy === "model" ? "Building 3D from drawings…" : floors.length === 0 ? "Add at least one floor plan" : `Build 3D model from ${floors.length} floor${floors.length === 1 ? "" : "s"}${roofPlans.length ? ` + ${roofPlans.length} roof${roofPlans.length === 1 ? "" : "s"}` : ""}${elevations.length ? ` + ${elevations.length} elevation${elevations.length === 1 ? "" : "s"}` : ""}`}</span>
        {busy === "model" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
      </Button>}

      {/* When the user supplies BOTH a 2D plan and a reference rendering,
          we bypass the master-prompt + approval render and go straight to
          the live 3D preview using the rendering as the fidelity target. */}
      {subject === "furniture" && fileDataUrl && referenceImages.length === 0 && <>
        {/* Step 2 — Write master prompt */}
        <div className="mt-8">{stepHeading(2, "Master rendering prompt", stage === "upload" || stage === "prompted", stage === "rendered" || stage === "modeling" || stage === "ready")}</div>
        <Button variant="studio" className="mt-3 h-12 w-full justify-between" disabled={!fileDataUrl || busy !== ""} onClick={() => void generatePrompt()}>
          <span>{busy === "prompt" ? "Reading your drawing…" : masterPrompt ? "Rewrite master prompt" : "Write master prompt"}</span>
          {busy === "prompt" ? <LoaderCircle className="animate-spin" /> : <Wand2 />}
        </Button>
        {masterPrompt && <Textarea value={masterPrompt} onChange={(event) => setMasterPrompt(event.target.value)} className="mt-3 min-h-40 text-xs" placeholder="Master rendering prompt — edit if you want to tweak the look" />}

        {/* Step 3 — Approval rendering */}
        {masterPrompt && <>
          <div className="mt-8">{stepHeading(3, "Approve the render", stage === "prompted" || stage === "rendered", stage === "modeling" || stage === "ready")}</div>
          <Button variant={renderUrl ? "outline" : "studio"} className="mt-3 h-12 w-full justify-between" disabled={busy !== "" || !masterPrompt.trim()} onClick={() => void renderPreview()}>
            <span>{busy === "render" ? "Rendering…" : renderUrl ? "Re-render" : "Render preview"}</span>
            {busy === "render" ? <LoaderCircle className="animate-spin" /> : renderUrl ? <RefreshCw /> : <Sparkles />}
          </Button>
          {renderUrl && <div className="mt-3 overflow-hidden rounded-2xl border border-border">
            <img src={renderUrl} alt="Approval rendering" className={`w-full object-cover transition-[filter] duration-500 ${renderFinal ? "blur-0" : "blur-2xl"}`} />
          </div>}
          {renderFinal && stage !== "modeling" && stage !== "ready" && <Button variant="default" className="mt-3 h-12 w-full justify-between" disabled={busy !== ""} onClick={() => void approveAndBuild()}>
            <span>{subject === "furniture" ? "Approve & reconstruct 3D mesh (.glb)" : "Approve & build 3D model"}</span>
            <Check />
          </Button>}
          {subject !== "furniture" && renderFinal && stage !== "modeling" && stage !== "ready" && <Button variant="outline" className="mt-2 h-12 w-full justify-between" disabled={busy !== ""} onClick={() => void reconstructMesh()}>
            <span>Reconstruct real 3D mesh from rendering (.glb)</span>
            <Sparkles />
          </Button>}
        </>}
      </>}

      {/* Step 4 — Live 3D + download */}
      {showLivePreview && <div ref={previewRef}>
        <div className="mt-8">{stepHeading(4, subject === "building" ? "Download 3D models by floor" : "Live 3D preview", stage === "modeling" || stage === "ready", Boolean(dae) || hasFloorExports)}</div>
        {busy === "model" && <div className="mt-3 rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-2 font-bold uppercase tracking-[0.14em]">
              <LoaderCircle className="size-4 animate-spin" /> {reconStatus || (glb !== null ? "Reconstructing textured mesh…" : "Building 3D model…")}
            </span>
            <span className="tabular-nums text-muted-foreground">{Math.round(modelProgress)}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out"
              style={{ width: `${modelProgress}%` }}
            />
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {subject === "furniture"
              ? (modelProgress < 25 ? "Analyzing drawing & references"
                : modelProgress < 55 ? "Extracting parts, materials & proportions"
                : modelProgress < 80 ? "Matching silhouette to approved rendering"
                : modelProgress < 100 ? "Assembling .dae"
                : "Complete")
              : (modelProgress < 25 ? "Analyzing drawing"
                : modelProgress < 55 ? "Extracting this floor's walls, openings & elements"
                : modelProgress < 80 ? "Triangulating floor geometry"
                : modelProgress < 100 ? "Assembling floor .dae files"
                : "Complete")}
          </p>
        </div>}
        {(dae || glb) && subject !== "building" && <div className="mt-3"><Furniture3DPreview key={glb || dae || "x"} plan={plan ?? undefined} daeDataUrl={dae ?? undefined} glbDataUrl={glb ?? undefined} /></div>}
        {subject === "building" && floorParts.length > 0 && summary && <div className="mt-3"><Building3DViewer parts={floorParts} outputUnits={summary.outputUnits} /></div>}
        {(dae || glb || obj || fbx || hasFloorExports) && summary && <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em]">Ready to download</p>
          <p className="mt-2 text-xs text-muted-foreground">{glb && dae ? `Reconstructed mesh of your approved rendering · ${quality === "high" ? "High poly" : "Low poly"} · ${summary.outputUnits} · opens in SketchUp, Blender, Rhino, Maya, 3ds Max` : subject === "building" && floorParts.length > 0 ? `${floorParts.length} part${floorParts.length === 1 ? "" : "s"} · ${summary.outputUnits} · built in order — site, each floor, then roof — as separate files at 100% fidelity from your drawings` : `${summary.count} ${summary.subject === "furniture" ? "parts" : "elements"} · ${summary.outputUnits} · grouped by material`}</p>
          {!(subject === "building" && floorParts.length > 0) && <><p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em]">Format</p>
          <div className="mt-2 flex rounded-xl border border-foreground p-1">
            <Button type="button" size="sm" variant={downloadFormat === "fbx" ? "default" : "ghost"} className="flex-1" disabled={!fbx && !hasFloorExports} onClick={() => setDownloadFormat("fbx")}>.fbx</Button>
            <Button type="button" size="sm" variant={downloadFormat === "obj" ? "default" : "ghost"} className="flex-1" disabled={!obj && !hasFloorExports} onClick={() => setDownloadFormat("obj")}>.obj</Button>
            <Button type="button" size="sm" variant={downloadFormat === "dae" ? "default" : "ghost"} className="flex-1" disabled={!dae && !hasFloorExports} onClick={() => setDownloadFormat("dae")}>.dae</Button>
          </div></>}
          {!(subject === "building" && floorParts.length > 0) && <Button variant="default" className="mt-4 h-11 w-full justify-between" onClick={() => download(downloadFormat)}><span>Download .{downloadFormat}</span><Download /></Button>}
        </div>}
      </div>}

      <ToolInformation sections={information} />
    </section>
    <ToolTabBar />
  </main>;
}