import { Link } from "@tanstack/react-router";
import { ArrowRight, Box, Boxes, Camera, Film, ImagePlus, Sparkles } from "lucide-react";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";

const tools = [
  { icon: Boxes, name: "2D to 3D", description: "Lift a floor plan PDF or image into an editable 3D .dae model", to: "/2d-to-3d", price: "$20/mo" },
  { icon: Sparkles, name: "Studio AI", description: "Complete configured spaces with exact furniture references", to: "/studio", price: "$5/mo" },
  { icon: Box, name: "3D to AI", description: "Turn any perspective into a photorealistic rendering", to: "/model-to-ai", price: "$10/mo" },
  { icon: ImagePlus, name: "AI Edits", description: "Add, remove, relight and transform scene details", to: "/ai-edits", price: "$15/mo" },
  { icon: Camera, name: "Photo to AI", description: "Edit a real photo through an AI conversation", to: "/photo-to-ai", price: "Free" },
  { icon: Film, name: "AI to Video", description: "Create a 10-second virtual tour from 2–5 views", to: "/ai-to-video", price: "$10/mo" },
] as const;

export function ToolsHub() {
  return <main className="dashboard-theme min-h-screen bg-background text-foreground"><FormaHeader /><PageIntro eyebrow="Five AI tools" title="Tools" description="Choose a specialized workflow for spaces, perspectives, edits, photos or virtual tours." /><section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]"><div className="organic-divider flex items-center justify-between py-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">All-access bundle</p><p className="mt-1 text-base font-semibold">FormAI Pro</p><p className="mt-1 text-xs text-muted-foreground">Every tool, unlocked.</p></div><Link to="/pricing" className="text-right"><span className="block text-lg font-bold">$45<span className="text-xs font-normal text-muted-foreground">/mo</span></span><span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em]">View plans <ArrowRight className="size-3" /></span></Link></div>{tools.map(({ icon: Icon, name, description, to, price }) => <Link key={to} to={to} className="organic-divider grid min-h-20 grid-cols-[2.75rem_1fr_auto] items-center gap-4 py-4"><span className="grid size-11 place-items-center"><Icon className="size-6" /></span><span><span className="block text-base font-semibold">{name}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span><span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em]">{price}</span></span><ArrowRight className="size-4 text-muted-foreground" /></Link>)}</section><ToolTabBar /></main>;
}