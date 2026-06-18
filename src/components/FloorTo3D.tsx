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
  { title: "What to upload", description: "Upload a floor plan of any architectural building — residence, office, retail, hospitality.", items: ["PDF, JPG or PNG up to 20 MB", "Top-down 2D floor plan with clear wall lines", "Visible dimensions or scale make extraction more accurate"] },
  { title: "How it works", items: ["AI vectorizes every wall as straight line segments in meters", "Walls are extruded upward by your chosen ceiling height", "A Collada .dae file is generated for use in Blender, SketchUp, Rhino, Cinema 4D, Unity or Unreal"] },
  { title: "Output", items: ["Editable 3D model in industry-standard Collada .dae format", "Z-up, meters, single mesh combining floor slab and walls", "Downloadable directly to your computer"] },
];

export function FloorTo3D() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [isPdf, setIsPdf] = useState(false);
  const [height, setHeight] = useState("2.7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dae, setDae] = useState<string | null>(null);
  const [wallCount, setWallCount] = useState(0);
  const { credits, signedIn, vip, consume } = useCredits();
  const navigate = useNavigate();
  const generate = useServerFn(generateFloor3D);

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20_000_000) { setError("Use a file smaller than 20 MB."); return; }
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
    const wallHeightMeters = Math.min(10, Math.max(1, Number(height) || 2.7));
    setBusy(true); setError(""); setDae(null);
    if (!(await consume())) {
      setBusy(false);
      if (!signedIn) { void navigate({ to: "/auth" }); return; }
      setError("You have no credits left. Open your Wallet to continue."); return;
    }
    try {
      const result = await generate({ data: { fileDataUrl, wallHeightMeters } });
      if (!result.ok) { setError(result.error); return; }
      setDae(result.daeDataUrl);
      setWallCount(result.wallCount);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The 3D file could not be generated.");
    } finally { setBusy(false); }
  }

  function download() {
    if (!dae) return;
    const baseName = (fileName.replace(/\.[^.]+$/, "") || "floorplan");
    const anchor = document.createElement("a");
    anchor.href = dae;
    anchor.download = `${baseName}.dae`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink /></div>
    <PageIntro eyebrow="2D to 3D" title="Floor plan to 3D" description="Upload an architectural floor plan as PDF, JPG or PNG. AI lifts the walls and exports an editable 3D Collada .dae file ready for Blender, SketchUp, Rhino, Cinema 4D, Unity or Unreal.">
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p>
    </PageIntro>
    <section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={upload} />
      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} className="relative min-h-56 w-full overflow-hidden rounded-2xl p-0">
        {fileDataUrl && !isPdf
          ? <img src={fileDataUrl} alt="Uploaded floor plan" className="max-h-[70vh] w-full object-contain" />
          : <span className="px-6 text-center">
              <Upload className="mx-auto size-6" />
              <span className="mt-3 block text-sm font-bold">{fileName || "Upload your floor plan"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">PDF, JPG or PNG · up to 20 MB</span>
            </span>}
      </Button>
      {fileName && <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => { setFileName(""); setFileDataUrl(null); setDae(null); if (fileRef.current) fileRef.current.value = ""; }}><X />Remove plan</Button>}

      <div className="organic-divider py-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Ceiling height</p>
        <p className="mt-2 text-xs text-muted-foreground">Wall extrusion height in meters</p>
        <Input value={height} onChange={(event) => setHeight(event.target.value)} type="number" min="1" max="10" step="0.1" inputMode="decimal" className="mt-3 h-12" />
      </div>

      {error && <p role="alert" className="mt-4 text-xs text-destructive">{error}</p>}

      <Button variant="studio" className="mt-6 h-12 w-full justify-between" disabled={!fileDataUrl || busy} onClick={() => void run()}>
        <span>{busy ? "Lifting walls into 3D…" : dae ? "Regenerate 3D model" : "Generate 3D model"}</span>
        {busy ? <LoaderCircle className="animate-spin" /> : <Box />}
      </Button>

      {dae && <div className="mt-6 rounded-2xl border border-border p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em]">3D model ready</p>
        <p className="mt-2 text-xs text-muted-foreground">{wallCount} wall segments extruded · Collada .dae · Z-up · meters</p>
        <Button variant="default" className="mt-4 h-11 w-full justify-between" onClick={download}><span>Download .dae</span><Download /></Button>
      </div>}

      <ToolInformation sections={information} />
    </section>
    <ToolTabBar />
  </main>;
}