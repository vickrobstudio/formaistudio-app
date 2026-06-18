import { Link } from "@tanstack/react-router";
import { ArrowRight, Box, Boxes, Camera, Film, ImagePlus, Sparkles } from "lucide-react";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";

const tools = [
  { icon: Sparkles, name: "Studio AI", description: "Complete configured spaces with exact furniture references", to: "/studio" },
  { icon: Box, name: "3D to AI", description: "Turn any perspective into a photorealistic rendering", to: "/model-to-ai" },
  { icon: Boxes, name: "2D to 3D", description: "Lift a floor plan PDF or image into an editable 3D .dae model", to: "/floor-to-3d" },
  { icon: ImagePlus, name: "AI Edits", description: "Add, remove, relight and transform scene details", to: "/ai-edits" },
  { icon: Camera, name: "Photo to AI", description: "Edit a real photo through an AI conversation", to: "/photo-to-ai" },
  { icon: Film, name: "AI to Video", description: "Create a 10-second virtual tour from 2–5 views", to: "/ai-to-video" },
] as const;

export function ToolsHub() {
  return <main className="dashboard-theme min-h-screen bg-background text-foreground"><FormaHeader /><PageIntro eyebrow="Five AI tools" title="Tools" description="Choose a specialized workflow for spaces, perspectives, edits, photos or virtual tours." /><section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">{tools.map(({ icon: Icon, name, description, to }) => <Link key={to} to={to} className="organic-divider grid min-h-20 grid-cols-[2.75rem_1fr_auto] items-center gap-4 py-4"><span className="grid size-11 place-items-center"><Icon className="size-6" /></span><span><span className="block text-base font-semibold">{name}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span><ArrowRight className="size-4 text-muted-foreground" /></Link>)}</section><ToolTabBar /></main>;
}