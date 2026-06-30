import { useEffect, useRef, useState } from "react";
import { FileText, LoaderCircle, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export type PdfPageRole =
  | { kind: "ignore" }
  | { kind: "floor"; order: number; label: string }
  | { kind: "roof" }
  | { kind: "site" }
  | { kind: "elevation"; facing: "N" | "S" | "E" | "W" | "other" };

export type PdfPageAssignment = {
  pageIndex: number;
  thumbDataUrl: string;
  hiResDataUrl: string;
  role: PdfPageRole;
};

export type PdfSetImportResult = {
  floors: Array<{ imageDataUrl: string; label: string; fileName: string }>;
  roofPlans: Array<{ imageDataUrl: string; fileName: string }>;
  sitePlan: { imageDataUrl: string; fileName: string } | null;
  elevations: Array<{ imageDataUrl: string; facing: "N" | "S" | "E" | "W" | "other"; label: string; fileName: string }>;
};

async function readPdfAsBytes(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

async function renderPageToCanvas(pdf: { getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; canvas: HTMLCanvasElement }) => { promise: Promise<void> } }> }, pageNum: number, targetLongSide: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const scale = targetLongSide / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

/**
 * OCR every word/number on the rendered page and paint solid white over each
 * text bbox. Removes labels, dimensions, room names, sheet titles — leaves
 * vector linework untouched.
 */
async function eraseTextOnCanvas(canvas: HTMLCanvasElement): Promise<void> {
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng", 1);
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    type WordLike = { text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number }; confidence?: number };
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.words)) {
        for (const w of obj.words as WordLike[]) {
          const t = (w.text ?? "").trim();
          if (!t || !w.bbox) continue;
          if ((w.confidence ?? 0) < 30 && t.length < 2) continue;
          const pad = 3;
          const x = Math.max(0, w.bbox.x0 - pad);
          const y = Math.max(0, w.bbox.y0 - pad);
          const ww = Math.min(canvas.width - x, w.bbox.x1 - w.bbox.x0 + pad * 2);
          const hh = Math.min(canvas.height - y, w.bbox.y1 - w.bbox.y0 + pad * 2);
          if (ww > 0 && hh > 0) ctx.fillRect(x, y, ww, hh);
        }
      }
      if (Array.isArray(obj.blocks)) for (const b of obj.blocks) walk(b);
      if (Array.isArray(obj.paragraphs)) for (const p of obj.paragraphs) walk(p);
      if (Array.isArray(obj.lines)) for (const l of obj.lines) walk(l);
    };
    walk(data);
  } finally {
    await worker.terminate();
  }
}

/**
 * Binarize the cleaned page to crisp black-on-white lines using a generous
 * luma cutoff plus a local-contrast rescue for hairlines. Anything else
 * becomes pure white, so the imported sheet is already a simple line drawing.
 */
function binarizeCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = id.data;
  const w = canvas.width, h = canvas.height;
  const luma = new Float32Array(w * h);
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (luma[p] < 205) mask[p] = 1;
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (mask[p]) continue;
      const avg = (luma[p - 1] + luma[p + 1] + luma[p - w] + luma[p + w]) * 0.25;
      if (luma[p] < avg - 14 && luma[p] < 235) mask[p] = 1;
    }
  }
  for (let p = 0, i = 0; p < mask.length; p++, i += 4) {
    if (mask[p]) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255; }
    else { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; }
  }
  ctx.putImageData(id, 0, 0);
}

/** Render a page and return its PNG data URL — used for the small thumbnails. */
async function renderPage(pdf: Parameters<typeof renderPageToCanvas>[0], pageNum: number, targetLongSide: number): Promise<string> {
  const canvas = await renderPageToCanvas(pdf, pageNum, targetLongSide);
  return canvas.toDataURL("image/png");
}

/**
 * Heuristic auto-classifier for a sheet, based on its embedded text layer.
 * Architectural plan views become floors/roof/site/elevation. M.E.P.,
 * structural-only, schedules, details and notes are ignored by default so
 * the AI only works on architectural geometry.
 */
function classifySheet(text: string, floorCounter: number): PdfPageRole {
  // M.E.P. and other non-architectural disciplines → ignore.
  const mepHints = [
    "mechanical", "hvac", "duct", "ductwork", "diffuser", "vav", "rtu",
    "electrical", "lighting plan", "power plan", "panel schedule", "circuit",
    "plumbing", "sanitary", "waste", "vent", "domestic water", "riser diagram",
    "fire protection", "sprinkler", "fire alarm",
    "low voltage", "data plan", "telecom",
    "structural notes", "framing plan", "foundation plan", "rebar", "shear wall",
    "schedule", "specifications", "general notes", "abbreviations", "legend sheet",
    "details ", "wall types", "door schedule", "window schedule",
  ];
  if (mepHints.some((h) => text.includes(h))) return { kind: "ignore" };

  // Plan-view sheet types that we DO want.
  const looksLikePlan = /\b(floor plan|level \d|first floor|second floor|third floor|ground floor|basement|main floor|upper floor|lower floor|plan view|architectural plan)\b/.test(text);
  const looksLikeRoof = /\broof plan\b/.test(text);
  const looksLikeSite = /\b(site plan|plot plan|survey)\b/.test(text);
  const looksLikeElevation = /\b(elevation|north elev|south elev|east elev|west elev|front elev|rear elev)\b/.test(text);

  if (looksLikeRoof) return { kind: "roof" };
  if (looksLikeSite) return { kind: "site" };
  if (looksLikeElevation) {
    const facing: "N" | "S" | "E" | "W" | "other" =
      /\bnorth\b/.test(text) ? "N" :
      /\bsouth\b/.test(text) ? "S" :
      /\beast\b/.test(text) ? "E" :
      /\bwest\b/.test(text) ? "W" : "other";
    return { kind: "elevation", facing };
  }
  if (looksLikePlan) {
    return { kind: "floor", order: floorCounter, label: floorCounter === 0 ? "Ground floor" : `Floor ${floorCounter}` };
  }
  // Unknown / no text → safest is to skip; the user can re-assign.
  return { kind: "ignore" };
}

export function PdfSetImporter({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (result: PdfSetImportResult) => void;
}) {
  const [pages, setPages] = useState<PdfPageAssignment[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<"idle" | "rendering">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the dialog closes so the next open starts clean.
  useEffect(() => {
    if (!open) {
      setPages([]); setFileName(""); setError(""); setBusy("idle"); setProgress({ done: 0, total: 0 });
    }
  }, [open]);

  async function handleFile(file: File) {
    setError("");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isDwgDxf = /\.(dwg|dxf)$/i.test(file.name);
    if (!isPdf && !isDwgDxf) {
      setError("Upload a PDF, DWG or DXF drawings set."); return;
    }
    setFileName(file.name);
    setBusy("rendering");
    try {
      if (isDwgDxf) {
        // DWG / DXF imports as a SINGLE floor — the vector database is a
        // single drawing, not a paged set. Parse, rasterize once, hand to
        // the same cleaning + classification pipeline as a PDF page.
        const { parseDrawing, rasterizeDatabase } = await import("@/lib/dwg-database");
        const db = await parseDrawing(file);
        const { dataUrl, width, height } = rasterizeDatabase(db, { maxDimension: 2600 });
        // Build a thumbnail.
        const thumbCanvas = document.createElement("canvas");
        const thumbScale = 360 / Math.max(width, height);
        thumbCanvas.width = Math.max(1, Math.round(width * thumbScale));
        thumbCanvas.height = Math.max(1, Math.round(height * thumbScale));
        const tctx = thumbCanvas.getContext("2d");
        if (tctx) {
          const img = new Image();
          await new Promise<void>((res, rej) => {
            img.onload = () => res();
            img.onerror = () => rej(new Error("Could not render the DWG/DXF."));
            img.src = dataUrl;
          });
          tctx.fillStyle = "#ffffff"; tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
          tctx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
        }
        const thumb = thumbCanvas.toDataURL("image/png");
        setPages([{ pageIndex: 1, thumbDataUrl: thumb, hiResDataUrl: dataUrl, role: { kind: "floor", order: 0, label: "Ground floor" } }]);
        setProgress({ done: 1, total: 1 });
        return;
      }
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const bytes = await readPdfAsBytes(file);
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      setProgress({ done: 0, total: pdf.numPages });
      const next: PdfPageAssignment[] = [];
      let floorCounter = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        // Pull the page's text layer FIRST to classify. We only spend time
        // cleaning sheets we will actually keep.
        // eslint-disable-next-line no-await-in-loop
        const textContent = await (await pdf.getPage(i)).getTextContent();
        const text = (textContent.items as Array<{ str?: string }>).map((it) => it.str ?? "").join(" ").toLowerCase();
        const role = classifySheet(text, floorCounter);
        if (role.kind === "floor") floorCounter++;
        // eslint-disable-next-line no-await-in-loop
        const hiResCanvas = await renderPageToCanvas(pdf as never, i, 2600);
        if (role.kind !== "ignore") {
          // Clean architectural pages before importing: erase text/numbers,
          // then binarize to a simple enclosed black-line drawing.
          // eslint-disable-next-line no-await-in-loop
          await eraseTextOnCanvas(hiResCanvas);
          binarizeCanvas(hiResCanvas);
        }
        const hiRes = hiResCanvas.toDataURL("image/png");
        // Build the thumbnail from the cleaned hi-res so users see the clean
        // line drawing immediately.
        const thumbCanvas = document.createElement("canvas");
        const thumbScale = 360 / Math.max(hiResCanvas.width, hiResCanvas.height);
        thumbCanvas.width = Math.max(1, Math.round(hiResCanvas.width * thumbScale));
        thumbCanvas.height = Math.max(1, Math.round(hiResCanvas.height * thumbScale));
        const tctx = thumbCanvas.getContext("2d");
        if (tctx) { tctx.fillStyle = "#ffffff"; tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height); tctx.drawImage(hiResCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height); }
        const thumb = thumbCanvas.toDataURL("image/png");
        next.push({ pageIndex: i, thumbDataUrl: thumb, hiResDataUrl: hiRes, role });
        setProgress({ done: i, total: pdf.numPages });
      }
      setPages(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read PDF.");
    } finally {
      setBusy("idle");
    }
  }

  function setRole(pageIndex: number, role: PdfPageRole) {
    setPages((prev) => {
      const updated = prev.map((p) => p.pageIndex === pageIndex ? { ...p, role } : p);
      // Renumber floor labels in page order so they stay sequential.
      let n = 0;
      return updated.map((p) => {
        if (p.role.kind !== "floor") return p;
        const label = n === 0 ? "Ground floor" : `Floor ${n}`;
        const out = { ...p, role: { kind: "floor" as const, order: n, label } };
        n++;
        return out;
      });
    });
  }

  function commit() {
    const result: PdfSetImportResult = { floors: [], roofPlans: [], sitePlan: null, elevations: [] };
    const base = fileName.replace(/\.pdf$/i, "");
    for (const p of pages) {
      const fn = `${base} · page ${p.pageIndex}.png`;
      if (p.role.kind === "floor") {
        result.floors.push({ imageDataUrl: p.hiResDataUrl, label: p.role.label, fileName: fn });
      } else if (p.role.kind === "roof") {
        result.roofPlans.push({ imageDataUrl: p.hiResDataUrl, fileName: fn });
      } else if (p.role.kind === "site") {
        result.sitePlan = { imageDataUrl: p.hiResDataUrl, fileName: fn };
      } else if (p.role.kind === "elevation") {
        result.elevations.push({ imageDataUrl: p.hiResDataUrl, facing: p.role.facing, label: "", fileName: fn });
      }
    }
    onImport(result);
    onOpenChange(false);
  }

  const counts = {
    floor: pages.filter((p) => p.role.kind === "floor").length,
    roof: pages.filter((p) => p.role.kind === "roof").length,
    site: pages.filter((p) => p.role.kind === "site").length,
    elevation: pages.filter((p) => p.role.kind === "elevation").length,
    ignore: pages.filter((p) => p.role.kind === "ignore").length,
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl">
      <DialogHeader>
        <DialogTitle>Import architectural PDF or DWG</DialogTitle>
        <DialogDescription>Upload one PDF containing every project sheet. Each architectural page is auto-classified, then cleaned on import — text and numbers are erased and only the enclosed black-line geometry is kept. M.E.P. and other non-architectural sheets are skipped by default.</DialogDescription>
      </DialogHeader>

      {pages.length === 0 && <div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleFile(f); }}
        />
        <Button type="button" variant="outline" className="h-32 w-full" onClick={() => inputRef.current?.click()} disabled={busy === "rendering"}>
          {busy === "rendering"
            ? <span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Cleaning page {progress.done} / {progress.total}…</span>
            : <span className="inline-flex items-center gap-2"><Upload className="size-4" />Choose a complete drawings set</span>}
        </Button>
        {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      </div>}

      {pages.length > 0 && <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-2"><FileText className="size-3" />{fileName} · {pages.length} page{pages.length === 1 ? "" : "s"}</span>
          <span className="text-muted-foreground">
            {counts.floor} floor · {counts.roof} roof · {counts.site} site · {counts.elevation} elevation · {counts.ignore} ignored
          </span>
        </div>
        <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 md:grid-cols-3">
          {pages.map((p) => <PageCard key={p.pageIndex} page={p} onChange={(role) => setRole(p.pageIndex, role)} />)}
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}><X className="size-3" />Cancel</Button>
          <Button type="button" onClick={commit} disabled={counts.floor + counts.roof + counts.site + counts.elevation === 0}>
            Import {counts.floor} floor{counts.floor === 1 ? "" : "s"}
            {counts.roof ? ` + ${counts.roof} roof` : ""}
            {counts.site ? " + site" : ""}
            {counts.elevation ? ` + ${counts.elevation} elevation${counts.elevation === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </div>}
    </DialogContent>
  </Dialog>;
}

function PageCard({ page, onChange }: { page: PdfPageAssignment; onChange: (role: PdfPageRole) => void }) {
  const kind = page.role.kind;
  return <div className="rounded-xl border border-border bg-secondary/30 p-2">
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md border border-border bg-white">
      <img src={page.thumbDataUrl} alt={`Page ${page.pageIndex}`} className="absolute inset-0 size-full object-contain" />
      <span className="absolute left-1 top-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-background">P{page.pageIndex}</span>
    </div>
    <div className="mt-2 space-y-1.5">
      <select
        className="h-8 w-full rounded-md border border-border bg-background px-2 text-[11px]"
        value={kind}
        onChange={(e) => {
          const v = e.target.value as PdfPageRole["kind"];
          if (v === "floor") onChange({ kind: "floor", order: 0, label: "Ground floor" });
          else if (v === "roof") onChange({ kind: "roof" });
          else if (v === "site") onChange({ kind: "site" });
          else if (v === "elevation") onChange({ kind: "elevation", facing: "N" });
          else onChange({ kind: "ignore" });
        }}
      >
        <option value="floor">Floor plan</option>
        <option value="roof">Roof plan</option>
        <option value="site">Site plan</option>
        <option value="elevation">Elevation</option>
        <option value="ignore">Ignore</option>
      </select>
      {page.role.kind === "floor" && <p className="text-[10px] text-muted-foreground">{page.role.label}</p>}
      {page.role.kind === "elevation" && <select
        className="h-7 w-full rounded-md border border-border bg-background px-2 text-[11px]"
        value={page.role.facing}
        onChange={(e) => onChange({ kind: "elevation", facing: e.target.value as "N" | "S" | "E" | "W" | "other" })}
      >
        <option value="N">North elevation</option>
        <option value="E">East elevation</option>
        <option value="S">South elevation</option>
        <option value="W">West elevation</option>
        <option value="other">Other elevation</option>
      </select>}
    </div>
  </div>;
}