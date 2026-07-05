import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Library, LoaderCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sharePublicCreation } from "@/lib/feed.functions";

export type ShareCreationType = "furniture" | "interior" | "render" | "building";

const TYPE_LABELS: Record<ShareCreationType, string> = {
  furniture: "Furniture",
  interior: "Interior",
  render: "Rendering",
  building: "Architecture",
};

/**
 * The community post composer — a gallery placard the creator fills in
 * before publishing a piece to the feed. Bottom sheet on iPhone, centered
 * card on iPad/desktop.
 */
export function ShareCreationDialog({
  image,
  creationType,
  defaultTitle = "",
  modelGlbPath = null,
  modelUsdzPath = null,
  onClose,
  onShared,
}: {
  image: string;
  creationType: ShareCreationType;
  defaultTitle?: string;
  modelGlbPath?: string | null;
  modelUsdzPath?: string | null;
  onClose: () => void;
  onShared: (visibility: "public" | "private") => void;
}) {
  const share = useServerFn(sharePublicCreation);
  const [title, setTitle] = useState(defaultTitle);
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState<"public" | "private" | null>(null);
  const [done, setDone] = useState<"public" | "private" | null>(null);
  const [error, setError] = useState("");

  async function submit(isPublic: boolean) {
    if (!title.trim()) {
      setError("Give your piece a title.");
      return;
    }
    setBusy(isPublic ? "public" : "private");
    setError("");
    try {
      await share({
        data: {
          title: title.trim().slice(0, 120),
          description: story.trim().slice(0, 1000),
          imageUrl: image,
          modelGlbPath,
          modelUsdzPath,
          isPublic,
          creationType,
        },
      });
      setDone(isPublic ? "public" : "private");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The piece could not be published.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Share your creation with the community"
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl border border-border bg-background pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground">The community gallery</p>
            <p className="mt-1 text-lg font-light tracking-tight">Showcase your piece</p>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X className="size-4" /></Button>
        </div>

        {done ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-foreground text-background"><Check className="size-6" /></span>
            <p className="mt-5 text-xl font-light">
              {done === "public" ? "Published to the community" : "Saved to your private library"}
            </p>
            <p className="mt-2 max-w-xs text-xs leading-5 text-muted-foreground">
              {done === "public"
                ? "Your piece now hangs in the gallery — find it in the Home feed."
                : "Only you can see it. You can publish it any time from your library."}
            </p>
            <Button className="mt-6 min-w-40" onClick={() => onShared(done)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-5 px-5 pt-5">
            <div className="rounded-2xl border border-border p-3">
              <img src={image} alt="Your creation" className="max-h-64 w-full rounded-xl object-cover" />
              <p className="mt-2 text-center text-[9px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                {TYPE_LABELS[creationType]}{modelGlbPath ? " · includes 3D model" : ""}
              </p>
            </div>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Title of the piece</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder="Name it like a work in a gallery…"
                className="mt-2 h-12 text-base"
              />
            </label>

            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Its story</span>
              <Textarea
                value={story}
                onChange={(event) => setStory(event.target.value)}
                maxLength={1000}
                placeholder="Materials, inspiration, the idea behind it…"
                className="mt-2 min-h-24 resize-none text-sm leading-6"
              />
            </label>

            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

            <div className="space-y-2">
              <Button
                variant="studio"
                className="h-12 w-full"
                disabled={busy !== null}
                onClick={() => void submit(true)}
              >
                {busy === "public" ? <LoaderCircle className="animate-spin" /> : <Send />}
                Publish to the community
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full"
                disabled={busy !== null}
                onClick={() => void submit(false)}
              >
                {busy === "private" ? <LoaderCircle className="animate-spin" /> : <Library />}
                Keep private in my library
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
