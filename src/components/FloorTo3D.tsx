import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type ChangeEvent } from "react";
import { Check, Download, LoaderCircle, RefreshCw, Sparkles, Upload, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { ToolInformation, type ToolInfoSection } from "@/components/ToolInformation";
import { useCredits } from "@/hooks/use-credits";
import { generateFloor3D } from "@/lib/floor-3d.functions";
import { buildMasterPrompt } from "@/lib/floor-3d-prompt.functions";
import { Furniture3DPreview } from "@/components/Furniture3DPreview";
import type { FurniturePlan } from "@/lib/floor-3d-shared";
import { streamImage } from "@/lib/stream-image";

const information: ToolInfoSection[] = [
  { title: "How it works", items: ["1 · Upload a dimensioned PDF / JPG / PNG and pick units", "2 · AI writes a master rendering prompt from the drawing", "3 · Approve the photoreal render", "4 · Live 3D preview opens in your browser — rotate, zoom, pan", "5 · Download a Collada .dae grouped by material/texture"] },
  { title: "What to upload", items: ["Building floor plan with walls, openings and printed dimensions", "Or furniture drawing with top, front and side views, printed dimensions and reference photo/render", "PDF, JPG or PNG up to 2 GB"] },
  { title: "Output", items: ["Photoreal hero rendering you can re-render until you like it", "Live in-browser 3D viewer with PBR materials matching the render", "Collada .dae · Z-up · units of your choice · one group per material so SketchUp / Blender shows separate layers"] },
];

type Stage = "upload" | "prompted" | "rendered" | "modeling" | "ready";

export function FloorTo3D() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
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
  const [plan, setPlan] = useState<FurniturePlan | null>(null);
  const [summary, setSummary] = useState<{ count: number; subject: "building" | "furniture"; outputUnits: "meters" | "feet" } | null>(null);
  const { credits, signedIn, vip, consume } = useCredits();
  const navigate = useNavigate();
  const generate = useServerFn(generateFloor3D);
  const writePrompt = useServerFn(buildMasterPrompt);

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
    setPlan(null);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setFileDataUrl(reader.result); };
    reader.readAsDataURL(file);
  }

  function clearFile() {
    setFileName("");
    setFileDataUrl(null);
    setStage("upload");
    setMasterPrompt("");
    setRenderUrl(null);
    setRenderFinal(false);
    setDae(null);
    setPlan(null);
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function generatePrompt() {
    if (!fileDataUrl) return;
    setBusy("prompt"); setError("");
    try {
      const result = await writePrompt({ data: { fileDataUrl, subject } });
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
      await streamImage(masterPrompt, fileDataUrl, (src, isFinal) => {
        setRenderUrl(src);
        if (isFinal) { setRenderFinal(true); setStage("rendered"); }
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The rendering could not be created.");
    } finally { setBusy(""); }
  }

  async function approveAndBuild() {
    if (!fileDataUrl) return;
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
      const result = await generate({ data: { fileDataUrl, wallHeightMeters, planUnits, outputUnits, subject } });
      if (!result.ok) { setError(result.error); return; }
      setDae(result.daeDataUrl);
      setSummary({ count: result.elementCount, subject: result.subject, outputUnits: result.outputUnits });
      if (result.plan.kind === "furniture") setPlan(result.plan as FurniturePlan);
      setStage("ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The 3D file could not be generated.");
    } finally { setBusy(""); }
  }

  function download() {
    if (!dae) return;
    const baseName = (fileName.replace(/\.[^.]+$/, "") || (subject === "furniture" ? "furniture" : "floorplan"));
    const anchor = document.createElement("a");
    anchor.href = dae;
    anchor.download = `${baseName}.dae`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  const stepHeading = (n: number, label: string, active: boolean, done: boolean) =>
    <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] ${active ? "text-foreground" : done ? "text-foreground/60" : "text-muted-foreground"}`}>
      <span className={`flex size-5 items-center justify-center rounded-full border ${done ? "border-foreground bg-foreground text-background" : active ? "border-foreground" : "border-border"}`}>{done ? <Check className="size-3" /> : n}</span>
      {label}
    </div>;

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
        {subject === "building" && <>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em]">Ceiling height</p>
          {planUnits === "meters"
            ? <label className="mt-3 block text-xs">Meters
                <Input value={heightMeters} onChange={(event) => setHeightMeters(event.target.value)} type="number" min="1" max="10" step="0.1" inputMode="decimal" className="mt-2 h-12" />
              </label>
            : <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="text-xs">Feet
                  <Input value={heightFeet} onChange={(event) => setHeightFeet(event.target.value)} type="number" min="0" max="33" step="1" inputMode="numeric" className="mt-2 h-12" />
                </label>
                <label className="text-xs">Inches
                  <Input value={heightInches} onChange={(event) => setHeightInches(event.target.value)} type="number" min="0" max="11" step="1" inputMode="numeric" className="mt-2 h-12" />
                </label>
              </div>}
        </>}
      </div>

      {error && <p role="alert" className="mt-4 text-xs text-destructive">{error}</p>}

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
          <span>Approve & build 3D model</span>
          <Check />
        </Button>}
      </>}

      {/* Step 4 — Live 3D + download */}
      {(stage === "modeling" || stage === "ready") && <>
        <div className="mt-8">{stepHeading(4, "Live 3D preview", stage === "modeling" || stage === "ready", stage === "ready")}</div>
        {busy === "model" && <div className="mt-3 flex h-56 items-center justify-center rounded-2xl border border-border text-xs text-muted-foreground">
          <LoaderCircle className="mr-2 animate-spin" /> Reconstructing geometry…
        </div>}
        {plan && stage === "ready" && <div className="mt-3"><Furniture3DPreview plan={plan} /></div>}
        {dae && summary && stage === "ready" && <div className="mt-4 rounded-2xl border border-border p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em]">Ready to download</p>
          <p className="mt-2 text-xs text-muted-foreground">{summary.count} {summary.subject === "furniture" ? "parts" : "elements"} · Collada .dae · Z-up · {summary.outputUnits} · grouped by material</p>
          <Button variant="default" className="mt-4 h-11 w-full justify-between" onClick={download}><span>Download .dae</span><Download /></Button>
        </div>}
      </>}

      <ToolInformation sections={information} />
    </section>
    <ToolTabBar />
  </main>;
}