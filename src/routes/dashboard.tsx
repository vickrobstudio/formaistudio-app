import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Box, Camera, Film, ImagePlus, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RocheHeader, PageIntro } from "@/components/RocheMobile";

const tools = [
  { to: "/studio", icon: Sparkles, name: "Studio AI", price: "$4.99 / project", description: "Complete interior designs, curated furniture and multiple photorealistic views." },
  { to: "/model-to-ai", icon: Box, name: "3D to AI", price: "1st upload free", description: "Transform a SketchUp model into polished architectural renderings." },
  { to: "/ai-edits", icon: ImagePlus, name: "AI Edits", price: "3 free edits", description: "Change materials, lighting, colors, wallpaper and artwork." },
  { to: "/photo-to-ai", icon: Camera, name: "Photo to AI", price: "Free", description: "Upload any room and redesign it through a conversational studio." },
  { to: "/ai-to-video", icon: Film, name: "AI to Video", price: "$29.99 / video", description: "Turn static renderings into a smooth cinematic walkthrough." },
] as const;

export const Route = createFileRoute("/dashboard")({ head: () => ({ meta: [{ title: "Dashboard — EX Roche Bobois AI Studio" }, { name: "description", content: "Choose an AI interior design tool." }, { property: "og:title", content: "AI Studio Dashboard" }, { property: "og:description", content: "Five tools for AI interior creation." }] }), component: Dashboard });

function Dashboard() { return <main className="min-h-screen bg-background"><RocheHeader /><PageIntro eyebrow="Creative suite" title="Choose a tool" description="Start creating interior designs, photorealistic renderings and cinematic presentations with AI."><Button asChild variant="ghost" className="mt-4 -ml-3 text-xs"><Link to="/auth"><UserRound />Sign in to save your work</Link></Button></PageIntro><section className="border-t border-border px-5 pb-12">{tools.map(({ to, icon: Icon, name, price, description }, index) => <Link key={to} to={to} className="group grid grid-cols-[3rem_1fr_auto] gap-4 border-b border-border py-6"><div className="grid size-12 place-items-center rounded-full bg-secondary"><Icon className="size-5" /></div><div><div className="flex items-baseline gap-2"><span className="text-[10px] text-muted-foreground">0{index + 1}</span><h2 className="text-xl font-medium">{name}</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p><p className="mt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{price}</p></div><ArrowRight className="mt-3 size-4 transition-transform group-hover:translate-x-1" /></Link>)}</section></main>; }