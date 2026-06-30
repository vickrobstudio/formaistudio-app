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

async function renderPage(pdf: { getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number }; canvas: HTMLCanvasElement }) => { promise: Promise<void> } }> }, pageNum: number, targetLongSide: number): Promise<string> {
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
  return canvas.toDataURL("image/png");
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
    if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) {
      setError("Only PDF sets are supported."); return;
    }
    setFileName(file.name);
    setBusy("rendering");
    try {
      const pdfjs = await import("pdfjs-dist");
      const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      const bytes = await readPdfAsBytes(file);
      const pdf = await pdfjs.getDocument({ data: bytes }).promise;
      setProgress({ done: 0, total: pdf.numPages });
      const next: PdfPageAssignment[] = [];
      let floorCounter = 0;
      for (let i = 1; i <= pdf.numPages; i++) {
        // eslint-disable-next-line no-await-in-loop
        const thumb = await renderPage(pdf as never, i, 360);
        // eslint-disable-next-line no-await-in-loop
        const hiRes = await renderPage(pdf as never, i, 2200);
        // Pull the page's text layer to auto-classify the sheet. We focus
        // ONLY on architectural plan views and ignore M.E.P. (mechanical,
        // electrical, plumbing), structural-only and detail sheets.
        // eslint-disable-next-line no-await-in-loop
        const textContent = await (await pdf.getPage(i)).getTextContent();
        const text = (textContent.items as Array<{ str?: string }>).map((it) => it.str ?? "").join(" ").toLowerCase();
        const role = classifySheet(text, floorCounter);
        if (role.kind === "floor") floorCounter++;
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
        <DialogTitle>Import a full drawing set</DialogTitle>
        <DialogDescription>Upload one PDF containing every sheet of the project. Each page is rendered as a high-resolution drawing — go through them and assign each one to a floor, roof, site or elevation. The AI uses these labels to organize the 3D model build.</DialogDescription>
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
            ? <span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Rendering page {progress.done} / {progress.total}…</span>
            : <span className="inline-flex items-center gap-2"><Upload className="size-4" />Choose a PDF drawing set</span>}
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