import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Box, ChevronDown, Download, FolderOpen, Image, Layers3, LoaderCircle, LogIn, Maximize2, Menu, Plus, Rotate3D, Save, ScanLine, Sparkles, Upload, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { listProjects, saveProject } from "@/lib/projects.functions";
import { streamImage } from "@/lib/stream-image";
import roomImage from "@/assets/studio-room.jpg";

const FurnitureViewer = lazy(() => import("@/components/FurnitureViewer").then((module) => ({ default: module.FurnitureViewer })));
type StudioMode = "render" | "3d";
type Project = Awaited<ReturnType<typeof listProjects>>[number];

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Forma — AI Architecture & 3D Creation Studio" },
    { name: "description", content: "Transform sketches, room photos and ideas into architectural renderings and interactive 3D concepts." },
    { property: "og:title", content: "Forma — AI Architecture & 3D Studio" },
    { property: "og:description", content: "Create architectural renderings and interactive 3D concepts in one workspace." },
  ] }),
  component: Studio,
});

function Studio() {
  const fileRef = useRef<HTMLInputElement>(null);
  const fetchProjects = useServerFn(listProjects);
  const persistProject = useServerFn(saveProject);
  const [mode, setMode] = useState<StudioMode>("render");
  const [projectId, setProjectId] = useState<string>();
  const [projectName, setProjectName] = useState("Untitled space");
  const [prompt, setPrompt] = useState("Open-plan living space with warm oak, textured plaster walls, soft daylight and clean contemporary furniture");
  const [image, setImage] = useState(roomImage);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [objectColor, setObjectColor] = useState("#5f7cff");
  const [autoRotate, setAutoRotate] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSessionEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSessionEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function generate() {
    setError("");
    setShowSource(false);
    setIsGenerating(true);
    try {
      await streamImage(prompt, sourceImage, (nextImage: string) => setImage(nextImage));
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "The rendering could not be created.");
    } finally { setIsGenerating(false); }
  }

  function uploadReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 6_000_000) { setError("Use an image smaller than 6 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") { setSourceImage(reader.result); setShowSource(true); } };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (!sessionEmail) { setAuthOpen(true); return; }
    setError("");
    try {
      const saved = await persistProject({ data: { id: projectId, name: projectName, mode, prompt, renderImageUrl: image.startsWith("data:") ? image : null, sourceImageUrl: sourceImage, settings: { objectColor, autoRotate } } });
      setProjectId(saved.id);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Project could not be saved."); }
  }

  async function openProjects() {
    if (!sessionEmail) { setAuthOpen(true); return; }
    try { setProjects(await fetchProjects()); setProjectsOpen(true); }
    catch { setError("Projects could not be loaded."); }
  }

  function loadProject(project: Project) {
    setProjectId(project.id); setProjectName(project.name); setMode(project.mode as StudioMode); setPrompt(project.prompt);
    if (project.render_image_url) setImage(project.render_image_url);
    setSourceImage(project.source_image_url); setProjectsOpen(false);
    if (project.settings && typeof project.settings === "object" && !Array.isArray(project.settings)) {
      if (typeof project.settings.objectColor === "string") setObjectColor(project.settings.objectColor);
      if (typeof project.settings.autoRotate === "boolean") setAutoRotate(project.settings.autoRotate);
    }
  }

  async function emailSignIn() {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    if (signInError) {
      const { error: signUpError } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (signUpError) { setError(signUpError.message); return; }
    }
    setAuthOpen(false);
  }

  async function googleSignIn() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin, extraParams: { prompt: "select_account" } });
    if (result.error) setError(result.error.message);
  }

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-card px-3 md:px-5">
        <div className="flex items-center gap-2 border-r border-border pr-4"><div className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground"><ScanLine className="size-4" /></div><span className="text-sm font-semibold tracking-tight">forma</span></div>
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3"><Input aria-label="Project name" value={projectName} onChange={(event) => setProjectName(event.target.value)} className="h-8 max-w-48 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0" /><ChevronDown className="size-3 text-muted-foreground"/><span className="hidden rounded-full bg-muted px-2 py-1 text-[9px] text-muted-foreground md:inline">Draft</span></div>
        <div className="flex items-center gap-1.5"><Button variant="ghost" size="sm" className="hidden md:flex" onClick={openProjects}><FolderOpen/> Projects</Button><Button variant="studioOutline" size="sm" onClick={save}><Save/> <span className="hidden sm:inline">Save</span></Button><Button variant="studio" size="sm" onClick={() => sessionEmail ? void supabase.auth.signOut() : setAuthOpen(true)}>{sessionEmail ? <span className="max-w-24 truncate">{sessionEmail}</span> : <><LogIn/> Sign in</>}</Button></div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Studio tools" className="flex h-14 shrink-0 items-center justify-center gap-2 border-b border-border bg-card md:h-auto md:w-16 md:flex-col md:justify-start md:border-b-0 md:border-r md:py-4">
          <Button variant={mode === "render" ? "default" : "ghost"} size="icon" aria-label="AI render" onClick={() => setMode("render")}><WandSparkles/></Button>
          <Button variant={mode === "3d" ? "default" : "ghost"} size="icon" aria-label="3D creation" onClick={() => setMode("3d")}><Box/></Button>
          <Button variant="ghost" size="icon" aria-label="Upload reference" onClick={() => fileRef.current?.click()}><Upload/></Button>
          <Button variant="ghost" size="icon" aria-label="Layers"><Layers3/></Button>
          <div className="hidden flex-1 md:block"/><Button variant="ghost" size="icon" aria-label="Menu"><Menu/></Button>
        </nav>

        <aside className="w-full shrink-0 border-b border-border bg-card md:w-80 md:border-b-0 md:border-r">
          <div className="border-b border-border p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{mode === "render" ? "AI visualization" : "3D configurator"}</p><h1 className="mt-1 text-xl font-semibold tracking-tight">{mode === "render" ? "Create a rendering" : "Shape your object"}</h1><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{mode === "render" ? "Upload a sketch or photo, describe the result, then generate." : "Inspect, orbit and configure a real-time 3D concept."}</p></div>
          <div className="space-y-5 p-5">
            {mode === "render" ? <>
              <div><div className="mb-2 flex items-center justify-between"><label className="studio-label" htmlFor="reference">Reference image</label>{sourceImage && <Button variant="ghost" size="sm" onClick={() => setSourceImage(null)}><X/> Remove</Button>}</div><input ref={fileRef} id="reference" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadReference}/><button type="button" onClick={() => fileRef.current?.click()} className="group relative flex h-28 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 transition-colors hover:border-primary">{sourceImage ? <img src={sourceImage} alt="Uploaded architecture reference" className="h-full w-full object-cover"/> : <div className="text-center"><Upload className="mx-auto mb-2 size-5 text-muted-foreground group-hover:text-primary"/><p className="text-xs font-medium">Upload sketch or photo</p><p className="mt-1 text-[10px] text-muted-foreground">PNG, JPG or WEBP · 6 MB max</p></div>}</button></div>
              <div><label className="studio-label" htmlFor="prompt">Describe your result</label><Textarea id="prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-2 min-h-28 resize-none bg-muted/35 text-xs leading-relaxed"/></div>
              <div><p className="studio-label mb-2">Quick styles</p><div className="grid grid-cols-2 gap-2">{["Photoreal", "Japandi", "Industrial", "Tropical"].map((style) => <Button key={style} variant="secondary" size="sm" className="justify-start text-[10px]" onClick={() => setPrompt((value) => `${value}, ${style.toLowerCase()} style`)}>{style}</Button>)}</div></div>
              <Button variant="studio" size="lg" className="w-full rounded-md" disabled={isGenerating || prompt.trim().length < 10} onClick={generate}>{isGenerating ? <LoaderCircle className="animate-spin"/> : <Sparkles/>}{isGenerating ? "Rendering…" : sourceImage ? "Transform image" : "Generate render"}</Button>
            </> : <>
              <div><p className="studio-label mb-3">Material color</p><div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3"><input type="color" value={objectColor} onChange={(event) => setObjectColor(event.target.value)} className="size-10 cursor-pointer rounded border-0 bg-transparent"/><div><p className="text-xs font-medium">Upholstery</p><p className="text-[10px] uppercase text-muted-foreground">{objectColor}</p></div></div></div>
              <div><p className="studio-label mb-2">Scene controls</p><Button variant={autoRotate ? "default" : "secondary"} className="w-full justify-start" onClick={() => setAutoRotate((value) => !value)}><Rotate3D/> Auto rotate</Button></div>
              <div className="rounded-lg border border-border bg-muted/30 p-4"><p className="studio-label">Navigation</p><div className="mt-3 grid grid-cols-2 gap-y-2 text-[11px]"><span className="text-muted-foreground">Orbit</span><span>Left drag</span><span className="text-muted-foreground">Zoom</span><span>Scroll</span><span className="text-muted-foreground">Reset</span><span>Double click</span></div></div>
            </>}
            {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
          </div>
        </aside>

        <section className="relative flex min-h-[520px] min-w-0 flex-1 flex-col bg-muted p-3 md:p-4">
          <div className="mb-3 flex h-9 items-center justify-between"><div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"><span className="size-1.5 rounded-full bg-primary"/>{mode === "render" ? "Render canvas" : "Realtime viewport"}</div><div className="flex items-center gap-1">{mode === "render" && sourceImage && <Button variant={showSource ? "default" : "secondary"} size="sm" onClick={() => setShowSource((value) => !value)}><Image/> {showSource ? "Showing source" : "Compare source"}</Button>}<Button variant="secondary" size="icon" aria-label="Fullscreen"><Maximize2/></Button><Button variant="secondary" size="icon" aria-label="Download" onClick={() => { const link = document.createElement("a"); link.href = image; link.download = "forma-render.png"; link.click(); }}><Download/></Button></div></div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
            {mode === "render" ? <img src={showSource && sourceImage ? sourceImage : image} alt={showSource ? "Uploaded architecture source" : "AI-generated architectural visualization"} className={`h-full min-h-[460px] w-full object-cover transition-[filter] duration-700 ${isGenerating ? "blur-xl" : "blur-0"}`} width={1600} height={1024}/> : <Suspense fallback={<div className="grid h-full min-h-[460px] place-items-center"><LoaderCircle className="animate-spin"/></div>}><div className="h-full min-h-[460px]"><FurnitureViewer color={objectColor} autoRotate={autoRotate}/></div></Suspense>}
            {isGenerating && <div className="absolute inset-0 grid place-items-center bg-background/20"><div className="rounded-full bg-card/90 px-4 py-2 text-xs font-medium shadow-xl"><LoaderCircle className="mr-2 inline size-4 animate-spin"/>Building your scene</div></div>}
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-card/85 px-3 py-2 text-[10px] shadow-lg backdrop-blur"><p className="font-medium text-foreground">{projectName}</p><p className="mt-0.5 text-muted-foreground">{mode === "render" ? "1536 × 1024 · AI Render" : "Interactive mesh · WebGL"}</p></div>
          </div>
        </section>
      </div>

      <Dialog open={authOpen} onOpenChange={setAuthOpen}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Save your studio</DialogTitle><DialogDescription>Sign in to keep projects and continue them from any device.</DialogDescription></DialogHeader><Button variant="outline" onClick={googleSignIn}>Continue with Google</Button><div className="flex items-center gap-3 text-[10px] text-muted-foreground"><span className="h-px flex-1 bg-border"/>OR<span className="h-px flex-1 bg-border"/></div><Input type="email" placeholder="Email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)}/><Input type="password" placeholder="Password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)}/><Button onClick={emailSignIn}>Continue with email</Button><p className="text-[10px] leading-relaxed text-muted-foreground">New accounts receive a verification email. Existing accounts are signed in.</p></DialogContent></Dialog>
      <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Your projects</DialogTitle><DialogDescription>Open a saved rendering or 3D concept.</DialogDescription></DialogHeader><div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-auto sm:grid-cols-2">{projects.length ? projects.map((project) => <Button key={project.id} variant="outline" className="h-auto justify-start p-3 text-left" onClick={() => loadProject(project)}>{project.render_image_url ? <img src={project.render_image_url} alt="" className="size-14 rounded object-cover"/> : <div className="grid size-14 place-items-center rounded bg-muted"><Box/></div>}<span><span className="block text-xs font-medium">{project.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{project.mode === "3d" ? "3D concept" : "AI rendering"}</span></span></Button>) : <div className="col-span-full py-10 text-center text-sm text-muted-foreground"><Plus className="mx-auto mb-2"/>No saved projects yet.</div>}</div></DialogContent></Dialog>
    </main>
  );
}
