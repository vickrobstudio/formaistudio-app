import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Box, Camera, Film, ImagePlus, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { useCredits } from "@/hooks/use-credits";

const dashboardItems = [
  { icon: Sparkles, name: "Studio", description: "Complete interior proposals · 1 credit", to: "/studio" },
  { icon: Box, name: "3D to AI", description: "Photorealistic views from 3D models · 1 credit", to: "/model-to-ai" },
  { icon: ImagePlus, name: "AI Edits", description: "Refine materials, lighting and details · 1 credit", to: "/ai-edits" },
  { icon: Camera, name: "Photo AI", description: "Always free · No account required", to: "/photo-to-ai" },
  { icon: Film, name: "AI Video", description: "Cinematic motion from renderings · 1 credit", to: "/ai-to-video" },
] as const;

export const Route = createFileRoute("/dashboard")({ head: () => ({ meta: [{ title: "Dashboard — FormAI STUDIO" }, { name: "description", content: "Use five AI interior tools with four guest credits and free Photo AI." }, { property: "og:title", content: "FormAI STUDIO Dashboard" }, { property: "og:description", content: "Four premium AI tools plus free Photo AI." }] }), component: Dashboard });

function Dashboard() {
  const { credits, signedIn, vip } = useCredits();
  return <main className="dashboard-theme min-h-screen bg-background text-foreground"><FormaHeader /><PageIntro eyebrow="Creative dashboard" title="Choose a tool" description="Use your starter credits on four premium tools, or open Photo AI free at any time."><p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p></PageIntro><section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">{dashboardItems.map(({ icon: Icon, name, description, ...item }) => {
    const content = <><div className="grid size-11 place-items-center text-foreground"><Icon className="size-6" /></div><div><h2 className="text-base font-semibold">{name}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><ArrowRight className="size-4 text-muted-foreground" /></>;
    return <Link key={name} to={item.to} className="organic-divider grid min-h-20 grid-cols-[2.75rem_1fr_auto] items-center gap-4 py-4">{content}</Link>;
  })}{!signedIn && <Button asChild variant="outline" className="mt-6 w-full"><Link to="/auth"><UserRound />Sign in or create account</Link></Button>}</section><ToolTabBar /></main>;
}