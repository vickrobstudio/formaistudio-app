import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, LoaderCircle, Share2, Sparkles } from "lucide-react";
import { DashboardDetail } from "@/components/DashboardDetail";
import { listMyActivity, type ActivityItem } from "@/lib/history.functions";

export const Route = createFileRoute("/_authenticated/history")({ component: HistoryPage });

const KIND_META: Record<ActivityItem["kind"], { label: string; icon: typeof Sparkles }> = {
  saved: { label: "Saved to Cloud", icon: Sparkles },
  shared: { label: "Shared to community", icon: Share2 },
  library: { label: "Saved to library", icon: Bookmark },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function HistoryPage() {
  const fetchActivity = useServerFn(listMyActivity);
  const { data: items = [], isLoading } = useQuery({ queryKey: ["my-activity"], queryFn: () => fetchActivity() });

  return <DashboardDetail eyebrow="Activity" title="History" description="Your recent creations and activity across FormAI Studio.">
    <section className="pb-8">
      {isLoading && <p className="organic-divider flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading your activity…</p>}
      {!isLoading && items.length === 0 && <p className="organic-divider py-8 text-center text-sm text-muted-foreground">No activity yet. Create a design, save it to your Cloud, or share it with the community — it will appear here.</p>}
      {!isLoading && items.length > 0 && <ul className="space-y-3">{items.map((item) => {
        const { label, icon: Icon } = KIND_META[item.kind];
        return <li key={item.id} className="flex items-center gap-4 rounded-2xl border border-border bg-secondary p-3">
          {item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" /> : <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-muted"><Icon className="size-5 text-muted-foreground" /></div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{item.title || "Untitled creation"}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-muted-foreground"><Icon className="size-3" />{label}{item.subtype ? ` · ${item.subtype}` : ""}</p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(item.when)}</span>
        </li>;
      })}</ul>}
    </section>
  </DashboardDetail>;
}
