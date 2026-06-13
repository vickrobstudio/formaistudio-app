import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { Box, Download, ImagePlus, LoaderCircle, Rotate3D, Sparkles, Upload, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { streamImage } from "@/lib/stream-image";
import roomImage from "@/assets/studio-room.jpg";

const FurnitureViewer = lazy(() => import("@/components/FurnitureViewer").then((module) => ({ default: module.FurnitureViewer })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maison Studio | AI Room Renderings & 3D" },
      { name: "description", content: "Create photorealistic luxury interiors with AI and inspect sculptural furniture in an interactive 3D studio." },
      { property: "og:title", content: "Maison Studio | AI Room Renderings & 3D" },
      { property: "og:description", content: "Create photorealistic luxury interiors and explore sculptural furniture in 3D." },
    ],
  }),
  component: Index,
});

function Index() {
  const [mode, setMode] = useState<"render" | "3d">("render");
  const [prompt, setPrompt] = useState("A light-filled Paris apartment with a sculptural burnt-orange modular sofa, travertine flooring and warm sunset light");
  const [image, setImage] = useState(roomImage);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setError("");
    setIsGenerating(true);
    try {
      await streamImage(prompt, (nextImage) => setImage(nextImage));
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "The rendering could not be created.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-8">
        <div className="flex items-baseline gap-3"><span className="font-display text-xl tracking-[-0.04em]">MAISON</span><span className="text-[9px] uppercase tracking-[0.34em] text-muted-foreground">AI Studio</span></div>
        <div className="flex items-center gap-2"><span className="hidden text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:block">Untitled interior</span><Button variant="studioOutline" size="sm">Save project</Button></div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[360px_1fr]">
        <aside className="border-b border-border bg-card p-5 lg:border-b-0 lg:border-r lg:p-7">
          <div className="mb-8">
            <p className="mb-2 text-[10px] uppercase tracking-[0.28em] text-primary">Creative atelier</p>
            <h1 className="font-display text-4xl leading-[0.96] tracking-[-0.04em]">Imagine a room.<br/><em>Make it real.</em></h1>
          </div>

          <div className="mb-6 grid grid-cols-2 border border-border p-1">
            <Button variant={mode === "render" ? "studio" : "ghost"} className="rounded-none" onClick={() => setMode("render")}><WandSparkles /> Render</Button>
            <Button variant={mode === "3d" ? "studio" : "ghost"} className="rounded-none" onClick={() => setMode("3d")}><Box /> 3D object</Button>
          </div>

          <section className="space-y-5">
            <div><label htmlFor="vision" className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.2em]">Your vision</label><Textarea id="vision" value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-32 rounded-none border-border bg-background p-4 text-sm leading-relaxed shadow-none focus-visible:ring-primary" /></div>
            <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]">Atmosphere</p><div className="flex flex-wrap gap-2">{["Editorial", "Warm", "Sculptural", "Minimal"].map((style) => <button key={style} type="button" onClick={() => setPrompt((value) => `${value}, ${style.toLowerCase()} atmosphere`)} className="border border-border bg-background px-3 py-2 text-[10px] uppercase tracking-wider transition-colors hover:border-primary hover:text-primary">{style}</button>)}</div></div>
            <div className="border border-dashed border-border p-4 text-center"><Upload className="mx-auto mb-2 size-5 text-muted-foreground"/><p className="text-xs">Drop a room photo or floor plan</p><p className="mt-1 text-[10px] text-muted-foreground">JPG, PNG · optional</p></div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <Button variant="studio" size="lg" className="w-full" disabled={isGenerating || prompt.trim().length < 10} onClick={generate}>{isGenerating ? <LoaderCircle className="animate-spin"/> : <Sparkles/>}{isGenerating ? "Creating rendering" : "Create rendering"}</Button>
          </section>

          <div className="mt-8 border-t border-border pt-5"><div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em]"><span className="text-muted-foreground">Output</span><span>1536 × 1024</span></div><div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.16em]"><span className="text-muted-foreground">Engine</span><span>Photoreal · V2</span></div></div>
        </aside>

        <section className="relative flex min-h-[560px] flex-col bg-muted p-3 md:p-6">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]"><span className="size-2 rounded-full bg-primary"/><span>{mode === "render" ? "Latest rendering" : "Interactive 3D model"}</span></div><div className="flex gap-2"><Button variant="studioOutline" size="icon" aria-label="Add reference"><ImagePlus/></Button><Button variant="studioOutline" size="icon" aria-label="Download image" onClick={() => { const link = document.createElement("a"); link.href = image; link.download = "maison-rendering.png"; link.click(); }}><Download/></Button></div></div>
          <div className="studio-in relative min-h-0 flex-1 overflow-hidden bg-card">
            {mode === "render" ? <img src={image} alt="AI-generated luxury living room interior" className={`h-full min-h-[500px] w-full object-cover transition-[filter] duration-700 ${isGenerating ? "blur-xl" : "blur-0"}`} width={1600} height={1024} /> : <Suspense fallback={<div className="flex h-full min-h-[500px] items-center justify-center"><LoaderCircle className="animate-spin"/></div>}><div className="h-full min-h-[500px]"><FurnitureViewer /></div></Suspense>}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex items-end justify-between bg-gradient-to-t from-foreground/70 to-transparent p-5 text-primary-foreground"><div><p className="font-display text-2xl">Mah Jong composition</p><p className="mt-1 text-[10px] uppercase tracking-[0.2em] opacity-75">Paris apartment · Golden hour</p></div>{mode === "3d" && <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider"><Rotate3D/> Drag to rotate</div>}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
