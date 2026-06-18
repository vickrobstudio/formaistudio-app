import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type ChangeEvent } from "react";
import { Box, Download, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { ToolInformation, type ToolInfoSection } from "@/components/ToolInformation";
import { useCredits } from "@/hooks/use-credits";
import { generateFloor3D } from "@/lib/floor-3d.functions";

const information: ToolInfoSection[] = [
  { title: "What to upload", description: "Upload a fully dimensioned PDF, JPG or PNG of either a floor plan or a single furniture piece.", items: ["Building floor plan with walls, openings and printed dimensions", "Or furniture drawing with top, front and side views and printed width, depth, height", "PDF, JPG or PNG up to 20 MB"] },
  { title: "Accuracy first", items: ["AI reads every printed dimension and respects the units you choose", "Heights, widths, depths and thicknesses are preserved to the millimetre", "Angles, alignments and parallelisms are preserved"] },
  { title: "Output", items: ["Editable Collada .dae model exported in the units you choose (meters or feet)", "Z-up, single mesh combining all walls or all furniture parts", "Opens in Blender, SketchUp, Rhino, Cinema 4D, Unity or Unreal"] },
];

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dae, setDae] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ count: number; subject: "building" | "furniture"; outputUnits: "meters" | "feet" } | null>(null);
  const { credits, signedIn, vip, consume } = useCredits();
  const navigate = useNavigate();
  const generate = useServerFn(generateFloor3D);

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000_000) { setError("Use a file smaller than 2 GB."); return; }
    setError("");
    setFileName(file.name);
    setIsPdf(file.type === "application/pdf");
    setDae(null);
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") setFileDataUrl(reader.result); };
    reader.readAsDataURL(file);
  }

  async function run() {
    if (!fileDataUrl) return;
    const rawMeters = planUnits === "meters"
      ? Number(heightMeters) || 2.7
      : ((Number(heightFeet) || 0) * 0.3048) + ((Number(heightInches) || 0) * 0.0254);
    const wallHeightMeters = Math.min(10, Math.max(1, rawMeters));
    setBusy(true); setError(""); setDae(null);
    if (!(await consume())) {
      setBusy(false);
      if (!signedIn) { void navigate({ to: "/auth" }); return; }
      setError("You have no credits left. Open your Wallet to continue."); return;
    }
    try {
      const result = await generate({ data: { fileDataUrl, wallHeightMeters, planUnits, outputUnits, subject } });
      if (!result.ok) { setError(result.error); return; }
      setDae(result.daeDataUrl);
      setSummary({ count: result.elementCount, subject: result.subject, outputUnits: result.outputUnits });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The 3D file could not be generated.");
    } finally { setBusy(false); }
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

  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink /></div>
    <PageIntro eyebrow="2D to 3D" title="2D plan to 3D model" description="Upload a fully dimensioned floor plan or furniture drawing. AI reads every printed dimension and exports an editable Collada .dae model in the units you choose.">
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p>
    </PageIntro>
    <section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
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
      {fileName && <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => { setFileName(""); setFileDataUrl(null); setDae(null); if (fileRef.current) fileRef.current.value = ""; }}><X />Remove file</Button>}

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

      <Button variant="studio" className="mt-6 h-12 w-full justify-between" disabled={!fileDataUrl || busy} onClick={() => void run()}>
        <span>{busy ? (subject === "furniture" ? "Reconstructing furniture in 3D…" : "Lifting walls into 3D…") : dae ? "Regenerate 3D model" : "Generate 3D model"}</span>
        {busy ? <LoaderCircle className="animate-spin" /> : <Box />}
      </Button>

      {dae && summary && <div className="mt-6 rounded-2xl border border-border p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em]">3D model ready</p>
        <p className="mt-2 text-xs text-muted-foreground">{summary.count} {summary.subject === "furniture" ? "parts" : "wall segments"} · Collada .dae · Z-up · {summary.outputUnits}</p>
        <Button variant="default" className="mt-4 h-11 w-full justify-between" onClick={download}><span>Download .dae</span><Download /></Button>
      </div>}

      <ToolInformation sections={information} />
    </section>
    <ToolTabBar />
  </main>;
}