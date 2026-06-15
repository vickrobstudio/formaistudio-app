import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listReusableFurniture } from "@/lib/feed.functions";

export function FurnitureLibraryPicker({ selected, onToggle, signedIn }: { selected: string[]; onToggle: (imageUrl: string) => void; signedIn: boolean }) {
  const loadFurniture = useServerFn(listReusableFurniture);
  const { data: furniture = [], isLoading } = useQuery({
    queryKey: ["reusable-furniture"],
    queryFn: () => loadFurniture(),
    enabled: signedIn,
  });

  if (!signedIn) return null;
  return <div className="rounded-2xl border border-border p-4">
    <p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em]"><Library className="size-4" />Your furniture library</p>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">Choose created or saved pieces to place accurately in this scene.</p>
    {isLoading && <p className="mt-4 text-xs text-muted-foreground">Loading furniture…</p>}
    {!isLoading && furniture.length === 0 && <p className="mt-4 text-xs text-muted-foreground">Furniture you create or save from the community will appear here.</p>}
    {furniture.length > 0 && <div className="mt-4 flex gap-3 overflow-x-auto pb-1">{furniture.map((item) => {
      const active = selected.includes(item.imageUrl);
      return <Button key={item.id} type="button" variant="ghost" className="relative h-auto w-28 shrink-0 flex-col items-stretch gap-2 p-0 text-left" onClick={() => onToggle(item.imageUrl)}>
        <span className="relative aspect-square overflow-hidden rounded-xl border border-border"><img src={item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover" />{active && <span className="absolute inset-0 grid place-items-center bg-foreground/45 text-background"><Check /></span>}</span>
        <span className="line-clamp-1 px-1 text-xs font-semibold">{item.title}</span><span className="px-1 pb-1 text-[10px] text-muted-foreground">{item.source}</span>
      </Button>;
    })}</div>}
  </div>;
}