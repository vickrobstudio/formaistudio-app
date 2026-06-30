import { Link } from "@tanstack/react-router";
import { ArrowRight, Box, Boxes, Camera, Film, ImagePlus, Sparkles } from "lucide-react";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";

const tools = [
  { icon: Boxes, name: "2D to 3D", tagline: "Plan → 3D model", to: "/2d-to-3d" },
  { icon: Sparkles, name: "Studio AI", tagline: "Furnish a space", to: "/studio" },
  { icon: Box, name: "3D to AI", tagline: "Render any view", to: "/model-to-ai" },
  { icon: ImagePlus, name: "AI Edits", tagline: "Edit & relight", to: "/ai-edits" },
  { icon: Camera, name: "Photo to AI", tagline: "Chat with a photo", to: "/photo-to-ai" },
  { icon: Film, name: "AI to Video", tagline: "10s virtual tour", to: "/ai-to-video" },
] as const;

export function ToolsHub() {
  return <main className="dashboard-theme min-h-screen bg-background text-foreground"><FormaHeader /><PageIntro eyebrow="Five AI tools" title="Tools" description="Choose a specialized workflow for spaces, perspectives, edits, photos or virtual tours." /><section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
    <Link to="/pricing" className="organic-divider flex items-center justify-between gap-4 py-4">
      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">All-access bundle</span>
        <span className="mt-1 block text-base font-semibold">FormAI Pro · every tool</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em]">View plans <ArrowRight className="size-3" /></span>
      </span>
    </Link>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tools.map(({ icon: Icon, name, tagline, to }) => <Link key={to} to={to} className="group relative flex aspect-square flex-col justify-between rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-accent">
        <Icon className="size-6" />
        <span className="block">
          <span className="block text-sm font-semibold leading-tight">{name}</span>
          <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{tagline}</span>
        </span>
      </Link>)}
    </div>
  </section><ToolTabBar /></main>;
}