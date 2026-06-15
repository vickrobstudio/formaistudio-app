import { useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { Check, ImagePlus, Layers3, Move, Palette, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listReusableFurniture } from "@/lib/feed.functions";

type Placement = { id: string; imageUrl: string; title: string; x: number; y: number; size: number };
type Selection = { x: number; y: number; width: number; height: number };

export function SceneComposer({ sourceImage, signedIn, onUseComposition }: { sourceImage: string | null; signedIn: boolean; onUseComposition: (image: string, instruction: string, texture: string | null) => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const textureRef = useRef<HTMLInputElement>(null);
  const loadFurniture = useServerFn(listReusableFurniture);
  const { data: furniture = [] } = useQuery({ queryKey: ["reusable-furniture"], queryFn: () => loadFurniture(), enabled: signedIn });
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [surfaceMode, setSurfaceMode] = useState(false);
  const [color, setColor] = useState("#b8a58d");
  const [texture, setTexture] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function relativePoint(event: PointerEvent<HTMLElement>) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 50, y: 50 };
    return { x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100)) };
  }

  function addFurniture(imageUrl: string, title: string) {
    setPlacements((current) => [...current, { id: crypto.randomUUID(), imageUrl, title, x: 50, y: 55, size: 30 }]);
  }

  function startSurface(event: PointerEvent<HTMLDivElement>) {
    if (!surfaceMode) return;
    const point = relativePoint(event);
    setSelectionStart(point);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveSurface(event: PointerEvent<HTMLDivElement>) {
    if (!surfaceMode || !selectionStart) return;
    const point = relativePoint(event);
    setSelection({ x: Math.min(selectionStart.x, point.x), y: Math.min(selectionStart.y, point.y), width: Math.abs(point.x - selectionStart.x), height: Math.abs(point.y - selectionStart.y) });
  }

  function movePlacement(event: PointerEvent<HTMLDivElement>, id: string) {
    if (surfaceMode) return;
    event.stopPropagation();
    const point = relativePoint(event);
    setSelectedId(id);
    const move = (moveEvent: globalThis.PointerEvent) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(100, (moveEvent.clientX - rect.left) / rect.width * 100));
      const y = Math.max(0, Math.min(100, (moveEvent.clientY - rect.top) / rect.height * 100));
      setPlacements((current) => current.map((item) => item.id === id ? { ...item, x, y } : item));
    };
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  }

  function uploadTexture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || file.size > 10_000_000) return;
    const reader = new FileReader();
    reader.onload = () => setTexture(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function exportComposition() {
    if (!sourceImage) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1536;
    canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (!context) return;
    const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
    try {
      const base = await load(sourceImage);
      context.drawImage(base, 0, 0, canvas.width, canvas.height);
      for (const item of placements) {
        const image = await load(item.imageUrl);
        const width = canvas.width * item.size / 100;
        const height = width * image.height / image.width;
        context.drawImage(image, canvas.width * item.x / 100 - width / 2, canvas.height * item.y / 100 - height / 2, width, height);
      }
      const region = selection ? `Modify only the selected region at ${Math.round(selection.x)}% from left, ${Math.round(selection.y)}% from top, size ${Math.round(selection.width)}% by ${Math.round(selection.height)}%. Change its color to ${color}${texture ? " and apply the supplied texture reference" : ""}.` : "";
      onUseComposition(canvas.toDataURL("image/png"), `${placements.length ? "Integrate the positioned furniture naturally with correct scale, perspective, contact shadows and occlusion." : ""} ${region} ${note}`.trim(), texture);
    } catch {
      setNote("One library image could not be composited. Download and upload it directly as a reference.");
    }
  }

  if (!sourceImage) return null;
  const selected = placements.find((item) => item.id === selectedId);
  return <div className="space-y-4 rounded-2xl border border-border p-4">
    <div><p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em]"><Layers3 className="size-4" />Live scene composer</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Add library furniture, drag it into position, or mark a surface to recolor and retexture.</p></div>
    <div ref={stageRef} className={`relative aspect-[3/2] touch-none overflow-hidden rounded-xl border border-border ${surfaceMode ? "cursor-crosshair" : ""}`} onPointerDown={startSurface} onPointerMove={moveSurface} onPointerUp={() => setSelectionStart(null)}>
      <img src={sourceImage} alt="Scene being composed" className="h-full w-full object-cover" />
      {placements.map((item) => <div key={item.id} role="button" tabIndex={0} aria-label={`Move ${item.title}`} className={`absolute -translate-x-1/2 -translate-y-1/2 touch-none ${selectedId === item.id ? "ring-2 ring-ring" : ""}`} style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.size}%` }} onPointerDown={(event) => movePlacement(event, item.id)}><img src={item.imageUrl} alt={item.title} draggable={false} className="w-full select-none object-contain drop-shadow-xl" /></div>)}
      {selection && <div className="pointer-events-none absolute border-2 border-primary bg-primary/15" style={{ left: `${selection.x}%`, top: `${selection.y}%`, width: `${selection.width}%`, height: `${selection.height}%` }} />}
    </div>
    {signedIn && furniture.length > 0 && <div className="flex gap-3 overflow-x-auto pb-1">{furniture.map((item) => <Button key={item.id} type="button" variant="ghost" className="h-auto w-24 shrink-0 flex-col items-stretch gap-2 p-0 text-left" onClick={() => addFurniture(item.imageUrl, item.title)}><span className="aspect-square overflow-hidden rounded-xl border border-border"><img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" /></span><span className="line-clamp-1 px-1 text-[10px]">{item.title}</span></Button>)}</div>}
    {selected && <div className="flex items-center gap-3"><Move className="size-4" /><Input aria-label="Furniture size" type="range" min="12" max="70" value={selected.size} onChange={(event) => setPlacements((current) => current.map((item) => item.id === selected.id ? { ...item, size: Number(event.target.value) } : item))} /><Button type="button" variant="ghost" size="icon" aria-label="Remove furniture" onClick={() => { setPlacements((current) => current.filter((item) => item.id !== selected.id)); setSelectedId(null); }}><Trash2 /></Button></div>}
    <Button type="button" variant={surfaceMode ? "default" : "outline"} className="w-full" onClick={() => setSurfaceMode((current) => !current)}><Palette />{surfaceMode ? "Draw a box on the surface" : "Select color or texture area"}</Button>
    {surfaceMode && <div className="grid grid-cols-[4rem_1fr] gap-3"><Input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="New surface color" className="h-11 p-1" /><><input ref={textureRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={uploadTexture} /><Button type="button" variant="outline" onClick={() => textureRef.current?.click()}>{texture ? <Check /> : <ImagePlus />}{texture ? "Texture attached" : "Texture reference"}</Button></></div>}
    <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional placement or material instructions" />
    <Button type="button" variant="studio" className="w-full" onClick={() => void exportComposition()}><Check />Use composition for AI update</Button>
  </div>;
}