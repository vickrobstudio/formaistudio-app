import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { publishGeneratedImage } from "@/lib/feed.functions";
import { submitInstagramCreation } from "@/lib/instagram.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ShareGeneratedImage({ image, signedIn }: { image: string; signedIn: boolean }) {
  const publish = useServerFn(publishGeneratedImage);
  const submitInstagram = useServerFn(submitInstagramCreation);
  const queryClient = useQueryClient();
  const id = useRef(crypto.randomUUID());
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [instagramConsent, setInstagramConsent] = useState(false);
  const [instagramSent, setInstagramSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState("");
  async function submit(destination: "community" | "instagram") {
    if (inFlight.current || !title.trim()) return;
    if (destination === "community" ? published || !consent : instagramSent || !instagramConsent) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      // Keep the original download untouched; create a smaller community copy.
      const img = new Image(); img.src = image; await img.decode();
      const factor = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * factor));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to prepare the image.");
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageDataUrl = canvas.toDataURL("image/jpeg", .88);
      if (imageDataUrl.length > 3_000_000) throw new Error("This image is too large to share. Please use a smaller copy.");
      if (destination === "instagram") {
        const caption = `${title}\n\n${description}\n\nAI-assisted creation made with FormAI Studio.`;
        await submitInstagram({ data: { id: id.current, title, caption, imageDataUrl, consent: true } });
        setInstagramSent(true);
      } else {
        await publish({ data: { id: id.current, title, description, imageDataUrl, consent: true } });
        setPublished(true);
        void queryClient.invalidateQueries({ queryKey: ["public-feed"] });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to share your creation."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="space-y-3 rounded-xl border border-border p-4">
    <Button variant="outline" onClick={() => setOpen(!open)}>Share creation</Button>
    {open && <div className="space-y-3">
      {!signedIn ? <p className="text-sm">Sign in to share your work. Download your image before leaving this page. <Link to="/auth" className="underline">Sign in</Link></p> : <>
        <label className="block text-sm">Title<Input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} disabled={busy} /></label>
        <label className="block text-sm">Description<textarea className="mt-1 block w-full rounded border bg-background p-2" value={description} maxLength={1000} onChange={e => setDescription(e.target.value)} disabled={busy} /></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} />I have permission to share this image publicly in the FormAI community under my profile name.</label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button disabled={busy || published || !consent || !title.trim()} onClick={() => void submit("community")}>{published ? "Published to community" : "Publish to Home feed"}</Button>
        {published && <p role="status"><Link to="/feed" className="underline">View Home feed</Link></p>}
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={instagramConsent} onChange={e => setInstagramConsent(e.target.checked)} disabled={busy || instagramSent} />I have permission to submit this image and caption for public posting on @formaistudio.app after FormAI approval.</label>
        <Button variant="outline" disabled={busy || instagramSent || !instagramConsent || !title.trim()} onClick={() => void submit("instagram")}>{instagramSent ? "Submitted for Instagram review" : "Submit to FormAI Instagram"}</Button>
        {instagramSent && <p role="status">Your creation is pending FormAI approval. It has not been posted to Instagram.</p>}
      </>}
      <p className="text-xs text-muted-foreground">Community and Instagram sharing are separate choices. Instagram posts require FormAI approval.</p>
    </div>}
  </div>;
}

