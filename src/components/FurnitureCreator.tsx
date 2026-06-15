import { useRef, useState, type ChangeEvent } from "react";
import { Download, ImagePlus, LoaderCircle, MapPin, Sparkles, X } from "lucide-react";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { streamImage } from "@/lib/stream-image";

const materialOptions = ["Solid wood", "Stone", "Metal", "Glass", "Upholstery", "Leather", "Recycled composite"];

export function FurnitureCreator() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [references, setReferences] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function attach(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 4);
    if (files.some((file) => file.size > 10_000_000)) return setError("Each reference must be smaller than 10 MB.");
    Promise.all(files.map((file) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file); }))).then((images) => setReferences(images.filter(Boolean)));
  }

  async function create() {
    if (prompt.trim().length < 10) return;
    setBusy(true);
    setError("");
    try {
      await streamImage(`Design one original, manufacturable custom furniture piece from this conversation: ${prompt}. Materials: ${materials.join(", ") || "designer selected"}. Supplier sourcing location: ${location || "global"}. Use attached references only for shape, construction, material and detail inspiration. Show the complete uncropped product as a premium photorealistic furniture concept on a neutral studio background, accurate proportions, no text, no logos.`, null, (image, isFinal) => { if (isFinal) setResult(image); }, references);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The furniture concept could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink to="/dashboard" label="Back" /></div><PageIntro eyebrow="Create with AI" title="Custom furniture" description="Describe a unique piece, attach visual references, select materials and set the supplier region you want to source from." /><section className="space-y-6 px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]"><input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={attach} />{result && <img src={result} alt="AI custom furniture concept" className="aspect-[4/3] w-full rounded-2xl border border-border object-cover" />}<Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Chat with AI: describe the shape, dimensions, function, style and details…" className="min-h-32 resize-none" /><Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}><ImagePlus />{references.length ? `${references.length} references attached` : "Upload references"}</Button>{references.length > 0 && <div className="grid grid-cols-4 gap-2">{references.map((reference, index) => <div key={`${reference.slice(-20)}-${index}`} className="relative aspect-square overflow-hidden rounded-xl border border-border"><img src={reference} alt={`Furniture reference ${index + 1}`} className="h-full w-full object-cover" /><Button type="button" variant="default" size="icon" aria-label={`Remove reference ${index + 1}`} className="absolute right-1 top-1 size-7 min-h-0 rounded-full" onClick={() => setReferences((current) => current.filter((_, itemIndex) => index !== itemIndex))}><X className="size-3" /></Button></div>)}</div>}<div><p className="text-xs uppercase tracking-[0.14em]">Materials</p><div className="mt-3 flex flex-wrap gap-2">{materialOptions.map((material) => <Button key={material} type="button" size="sm" variant={materials.includes(material) ? "default" : "outline"} onClick={() => setMaterials((current) => current.includes(material) ? current.filter((item) => item !== material) : [...current, material])}>{material}</Button>)}</div></div><label className="block text-xs"><span className="flex items-center gap-2 uppercase tracking-[0.14em]"><MapPin className="size-4" />Supplier location</span><Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, country or region" className="mt-2 h-12" /></label>{location && <p className="text-xs leading-5 text-muted-foreground">The concept will prioritize materials and manufacturing methods commonly available near {location}. Supplier outreach and live inventory require verified supplier partnerships.</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<Button variant="studio" className="h-12 w-full" disabled={busy || prompt.trim().length < 10} onClick={() => void create()}>{busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{busy ? "Creating furniture…" : "Create furniture concept"}</Button>{result && <Button asChild variant="outline" className="w-full"><a href={result} download="formai-custom-furniture.png"><Download />Download concept</a></Button>}</section><ToolTabBar /></main>;
}