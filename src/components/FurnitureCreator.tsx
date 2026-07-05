import { useRef, useState, type ChangeEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Box, Download, ImagePlus, Library, LoaderCircle, MapPin, Share2, Sparkles, X } from "lucide-react";
import { FormaHeader, PAGE_SHELL, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { streamImage } from "@/lib/stream-image";
import { saveFurnitureCreation } from "@/lib/feed.functions";
import { useCredits } from "@/hooks/use-credits";
import { FurnitureSketchBoard } from "@/components/FurnitureSketchBoard";
import { AiPlanGenerator } from "@/components/AiPlanGenerator";
import { Furniture3DViewer } from "@/components/Furniture3DViewer";
import { generateFurniture3D } from "@/lib/furniture-3d.functions";
import { saveMediaToDevice } from "@/lib/save-to-device";

const materialOptions = ["Solid wood", "Stone", "Metal", "Glass", "Upholstery", "Leather", "Recycled composite"];

export function FurnitureCreator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const modelPreviewRef = useRef<HTMLDivElement>(null);
  const [references, setReferences] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelGlbPath, setModelGlbPath] = useState<string | null>(null);
  const [modelUsdzPath, setModelUsdzPath] = useState<string | null>(null);
  const [generating3D, setGenerating3D] = useState(false);
  const [conceptProgress, setConceptProgress] = useState(0);
  const [modelProgress, setModelProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<"private" | "public" | null>(null);
  const { signedIn } = useCredits();
  const saveFurniture = useServerFn(saveFurnitureCreation);
  const create3D = useServerFn(generateFurniture3D);

  function attach(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 4);
    if (files.some((file) => file.size > 10_000_000)) return setError("Each reference must be smaller than 10 MB.");
    Promise.all(files.map((file) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file); }))).then((images) => setReferences(images.filter(Boolean)));
  }

  async function create() {
    if (prompt.trim().length < 10) return;
    setBusy(true);
    setConceptProgress(3);
    setError("");
    const progressTimer = window.setInterval(() => {
      setConceptProgress((current) => Math.min(97, current + Math.max(1, Math.round((97 - current) / 14))));
    }, 900);
    try {
      await streamImage(`Design one original, manufacturable custom furniture piece from this conversation: ${prompt}. Materials: ${materials.join(", ") || "designer selected"}. Supplier sourcing location: ${location || "global"}. Use attached references only for shape, construction, material and detail inspiration. Show the complete uncropped product as an 8K-target luxury editorial furniture photograph by an elite architectural and product photographer, on a warm neutral studio background, with accurate proportions, realistic color, true material grain, texture, reflectance and controlled HDR illumination, no text, no logos.`, null, (image, isFinal) => {
        if (isFinal) {
          setResult(image);
          setConceptProgress(100);
        } else {
          setResult(image);
          setConceptProgress((current) => Math.min(96, current + 6));
        }
      }, references);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The furniture concept could not be created.");
    } finally {
      window.clearInterval(progressTimer);
      setBusy(false);
    }
  }

  async function saveToLibrary(isPublic: boolean) {
    if (!result) return;
    setBusy(true);
    setError("");
    try {
      await saveFurniture({ data: { title: prompt.trim().slice(0, 120), description: `Custom furniture concept. Materials: ${materials.join(", ") || "Designer selected"}.`, imageUrl: result, modelGlbPath, modelUsdzPath, isPublic } });
      setSaved(isPublic ? "public" : "private");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The furniture piece could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function createRotatableModel() {
    if (!result) return;
    setGenerating3D(true);
    setModelProgress(4);
    setError("");
    const progressTimer = window.setInterval(() => {
      setModelProgress((current) => Math.min(94, current + Math.max(1, Math.round((94 - current) / 12))));
    }, 900);
    try {
      const model = await create3D({ data: { imageDataUrl: result } });
      if (!model.ok) {
        setModelProgress(0);
        setError(model.error);
        return;
      }
      setModelUrl(model.modelUrl);
      setModelGlbPath(model.modelPath);
      setModelUsdzPath(null);
      setSaved(null);
      setModelProgress(100);
      window.setTimeout(() => {
        modelPreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The 3D furniture model could not be created.");
    } finally {
      window.clearInterval(progressTimer);
      setGenerating3D(false);
    }
  }

  async function saveConcept() {
    if (!result) return;
    try { await saveMediaToDevice(result, "formai-custom-furniture.png", "image/png"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The image could not be saved."); }
  }

  return <main className="min-h-screen bg-background"><FormaHeader /><PageIntro eyebrow="Create with AI" title="Custom furniture" description="Draw an original shape, explore nature-inspired forms, or upload a reference image for shape, texture, or inspiration." /><section className={`${PAGE_SHELL} px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:grid md:grid-cols-2 md:items-start md:gap-x-10 lg:gap-x-14`}><div className="space-y-6"><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={attach} /><FurnitureSketchBoard onAddReferences={(images) => setReferences((current) => [...current, ...images].slice(0, 4))} onInspiration={setPrompt} />{result && <div className="space-y-3"><p className="text-[10px] font-bold uppercase tracking-[0.2em]">Your furniture concept</p><img src={result} alt="AI custom furniture concept" className="aspect-[4/3] w-full rounded-2xl border border-border object-cover" /><Button type="button" variant="outline" className="w-full" onClick={() => void saveConcept()}><Download />Save image to Photos</Button></div>}{modelUrl && <div ref={modelPreviewRef} className="space-y-3"><p className="text-[10px] font-bold uppercase tracking-[0.2em]">Live 360° 3D preview</p><Furniture3DViewer modelUrl={modelUrl} onUsdExported={(path) => { setModelUsdzPath(path); setSaved(null); }} /></div>}</div><div className="mt-6 space-y-6 md:mt-0"><Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Chat with AI: describe the shape, dimensions, function, style and details…" className="min-h-32 resize-none" /><Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}><ImagePlus />{references.length ? `${references.length} shape, texture, or inspiration references` : "Upload more reference images"}</Button>{references.length > 0 && <div className="grid grid-cols-4 gap-2">{references.map((reference, index) => <div key={`${reference.slice(-20)}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-border"><img src={reference} alt={`Furniture reference ${index + 1}`} className="h-full w-full object-cover" /><Button type="button" variant="default" size="icon" aria-label={`Remove reference ${index + 1}`} className="absolute right-1 top-1 size-7 min-h-0 rounded-full" onClick={() => setReferences((current) => current.filter((_, itemIndex) => index !== itemIndex))}><X className="size-3" /></Button></div>)}</div>}<div><p className="text-xs uppercase tracking-[0.14em]">Materials</p><div className="mt-3 flex flex-wrap gap-2">{materialOptions.map((material) => <Button key={material} type="button" size="sm" variant={materials.includes(material) ? "default" : "outline"} onClick={() => setMaterials((current) => current.includes(material) ? current.filter((item) => item !== material) : [...current, material])}>{material}</Button>)}</div></div><label className="block text-xs"><span className="flex items-center gap-2 uppercase tracking-[0.14em]"><MapPin className="size-4" />Supplier location</span><Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, country or region" className="mt-2 h-12" /></label>{location && <p className="text-xs leading-5 text-muted-foreground">The concept will prioritize materials and manufacturing methods commonly available near {location}. Supplier outreach and live inventory require verified supplier partnerships.</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}{saved && <p role="status" className="text-xs">Saved to your Cloud and interior library{saved === "public" ? ", and shared with the community" : ""}.</p>}{busy && <div role="status" aria-live="polite" className="space-y-2"><div className="flex items-center justify-between text-xs"><span>Creating furniture piece</span><span className="font-semibold tabular-nums">{conceptProgress}%</span></div><progress value={conceptProgress} max={100} aria-label="Furniture concept creation progress" className="h-1.5 w-full accent-foreground" /></div>}<Button variant="studio" className="h-12 w-full" disabled={busy || prompt.trim().length < 10} onClick={() => void create()}>{busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{busy ? `Creating furniture… ${conceptProgress}%` : "Create furniture concept"}</Button>{result && <>{generating3D && <div role="status" aria-live="polite" className="space-y-2"><div className="flex items-center justify-between text-xs"><span>Building rotatable 3D model</span><span className="font-semibold tabular-nums">{modelProgress}%</span></div><progress value={modelProgress} max={100} aria-label="3D model creation progress" className="h-1.5 w-full accent-foreground" /></div>}<Button variant="studio" className="h-12 w-full" disabled={!signedIn || generating3D} onClick={() => void createRotatableModel()}>{generating3D ? <LoaderCircle className="animate-spin" /> : <Box />}{generating3D ? `Creating USDZ-ready 3D model… ${modelProgress}%` : modelUrl ? "Regenerate 3D model" : "Continue to 3D · USDZ"}</Button><AiPlanGenerator sourceImage={result} kind="furniture" /><div className="grid grid-cols-2 gap-3"><Button variant="outline" disabled={!signedIn || busy || Boolean(saved)} onClick={() => void saveToLibrary(false)}><Library />Save</Button><Button variant="outline" disabled={!signedIn || busy || Boolean(saved)} onClick={() => void saveToLibrary(true)}><Share2 />Share</Button></div>{!signedIn && <p className="text-center text-xs text-muted-foreground">Sign in to create 3D files and save this piece to your reusable furniture library.</p>}</>}</div></section><ToolTabBar /></main>;
}