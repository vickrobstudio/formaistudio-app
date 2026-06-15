import { useRef, useState, type ChangeEvent } from "react";
import { Download, Film, LoaderCircle, Play, Upload, X } from "lucide-react";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { Button } from "@/components/ui/button";
import { ToolInformation } from "@/components/ToolInformation";
import { videoInformation } from "@/lib/tool-information";
import { saveMediaToDevice } from "@/lib/save-to-device.client";

type TourImage = { name: string; url: string };

export function VideoStudio() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<TourImage[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function selectImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    setError("");
    if (selected.length < 2 || selected.length > 5) return setError("Choose between 2 and 5 JPG or PNG images.");
    if (selected.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10_000_000)) return setError("Each image must be JPG, PNG or WEBP and smaller than 10 MB.");
    images.forEach((image) => URL.revokeObjectURL(image.url));
    setImages(selected.map((file) => ({ name: file.name, url: URL.createObjectURL(file) })));
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
  }

  async function createTour() {
    if (images.length < 2) return;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Video creation is not supported on this device.");
      const drawingContext = context;
      const loaded = await Promise.all(images.map((item) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = item.url; })));
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const finished = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
      recorder.start();
      const started = performance.now();
      await new Promise<void>((resolve) => {
        function draw(now: number) {
          const elapsed = Math.min(10_000, now - started);
          const progress = elapsed / 10_000;
          const position = progress * images.length;
          const index = Math.min(images.length - 1, Math.floor(position));
          const local = position - index;
          const current = loaded[index];
          const next = loaded[Math.min(images.length - 1, index + 1)];
          const paint = (image: HTMLImageElement, alpha: number, zoom: number) => {
            const scale = Math.max(canvas.width / image.width, canvas.height / image.height) * zoom;
            const width = image.width * scale;
            const height = image.height * scale;
            drawingContext.globalAlpha = alpha;
            drawingContext.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
          };
          drawingContext.fillStyle = "#000";
          drawingContext.fillRect(0, 0, canvas.width, canvas.height);
          paint(current, 1, 1 + local * 0.06);
          if (local > 0.72 && next !== current) paint(next, (local - 0.72) / 0.28, 1.06 - local * 0.06);
          drawingContext.globalAlpha = 1;
          if (elapsed < 10_000) requestAnimationFrame(draw); else resolve();
        }
        requestAnimationFrame(draw);
      });
      recorder.stop();
      await finished;
      setVideoUrl(URL.createObjectURL(new Blob(chunks, { type: "video/webm" })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The tour could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function saveVideo() {
    if (!videoUrl) return;
    try { await saveMediaToDevice(videoUrl, "formai-virtual-tour.webm", "video/webm"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The video could not be saved."); }
  }

  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink /></div><PageIntro eyebrow="AI to Video" title="Create a virtual tour" description="Combine 2–5 renderings or photos into a smooth 10-second cinematic walkthrough." /><section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]"><input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={selectImages} /><Button type="button" variant="outline" className="min-h-44 w-full flex-col gap-3 rounded-2xl" onClick={() => fileRef.current?.click()}><Upload /><span>{images.length ? `${images.length} views selected` : "Upload 2–5 views"}</span><span className="text-xs text-muted-foreground">JPG, PNG or WEBP</span></Button>{images.length > 0 && <div className="mt-4 grid grid-cols-3 gap-2">{images.map((image, index) => <div key={image.url} className="relative aspect-video overflow-hidden rounded-xl border border-border"><img src={image.url} alt={`Tour view ${index + 1}`} className="h-full w-full object-cover" /><Button type="button" size="icon" variant="default" aria-label={`Remove view ${index + 1}`} className="absolute right-1 top-1 size-7 min-h-0 rounded-full" onClick={() => setImages((current) => current.filter((item) => item.url !== image.url))}><X className="size-3" /></Button></div>)}</div>}{videoUrl && <video src={videoUrl} controls playsInline className="mt-5 aspect-video w-full rounded-2xl border border-border object-cover" />}{error && <p role="alert" className="mt-3 text-xs text-destructive">{error}</p>}<Button variant="studio" className="mt-5 h-12 w-full" disabled={busy || images.length < 2} onClick={() => void createTour()}>{busy ? <LoaderCircle className="animate-spin" /> : <Play />}{busy ? "Creating 10-second tour…" : "Create 10-second tour"}</Button>{videoUrl && <Button type="button" variant="outline" className="mt-3 h-12 w-full" onClick={() => void saveVideo()}><Download />Save to Camera Roll</Button>}<ToolInformation sections={videoInformation} /></section><ToolTabBar /></main>;
}