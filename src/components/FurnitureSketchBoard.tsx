import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { Eraser, ImagePlus, Leaf, Pencil, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FurnitureSketchBoard({ onAddReferences, onInspiration }: { onAddReferences: (images: string[]) => void; onInspiration: (prompt: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textureRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSketch, setHasSketch] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "black";
    context.lineWidth = 5;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, []);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
    setDrawing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const position = point(event);
    context.lineTo(position.x, position.y);
    context.stroke();
    setHasSketch(true);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasSketch(false);
  }

  function addSketch() {
    const sketch = canvasRef.current?.toDataURL("image/png");
    if (sketch) onAddReferences([sketch]);
  }

  function addTexture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || file.size > 10_000_000) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") onAddReferences([reader.result]); };
    reader.readAsDataURL(file);
  }

  return <div className="space-y-4 rounded-2xl border border-border p-4">
    <div><p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em]"><Pencil className="size-4" />Shape studio</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Draw a silhouette, trace an idea, or upload a material texture for AI to reinterpret.</p></div>
    <canvas ref={canvasRef} width={900} height={560} aria-label="Furniture shape drawing canvas" className="aspect-[9/5.6] w-full touch-none rounded-xl border border-border bg-primary" onPointerDown={start} onPointerMove={move} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)} />
    <div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" onClick={clear}><Eraser />Clear</Button><Button type="button" variant="outline" disabled={!hasSketch} onClick={addSketch}><Pencil />Use sketch</Button></div>
    <input ref={textureRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={addTexture} />
    <Button type="button" variant="outline" className="w-full" onClick={() => textureRef.current?.click()}><ImagePlus />Upload texture reference</Button>
    <div><p className="text-xs uppercase tracking-[0.14em]">Organic inspiration</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => onInspiration("Create a sculptural furniture form inspired by smooth river stones and erosion") }><Waves />River stone</Button><Button type="button" size="sm" variant="outline" onClick={() => onInspiration("Create a biomorphic furniture form inspired by leaves, stems and natural branching") }><Leaf />Botanical</Button><Button type="button" size="sm" variant="outline" onClick={() => onInspiration("Create an organic furniture form inspired by shells, waves and continuous curves") }><Waves />Shell & wave</Button></div></div>
  </div>;
}