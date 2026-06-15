import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Cloud, History, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { useCredits } from "@/hooks/use-credits";

const dashboardItems = [
  { icon: UserRound, name: "Account", description: "Profile and account details", to: "/account" },
  { icon: Cloud, name: "My Cloud", description: "Stored images, projects, products and materials", to: "/cloud" },
  { icon: History, name: "History", description: "Recent creations and activity", to: "/history" },
] as const;

export const Route = createFileRoute("/dashboard")({ head: () => ({ meta: [{ title: "Profile — FormAI STUDIO" }, { name: "description", content: "Manage your FormAI STUDIO profile, cloud library and activity." }, { property: "og:title", content: "FormAI STUDIO Profile" }, { property: "og:description", content: "Your account and creative cloud." }] }), component: Dashboard });

function Dashboard() {
  const { credits, signedIn, vip } = useCredits();
  return <main className="dashboard-theme min-h-screen bg-background text-foreground"><FormaHeader /><PageIntro eyebrow="Profile dashboard" title="Your account" description="Manage account details, saved images and projects, and recent activity."><p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p></PageIntro><section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">{signedIn && dashboardItems.map(({ icon: Icon, name, description, ...item }) => {
    const content = <><div className="grid size-11 place-items-center text-foreground"><Icon className="size-6" /></div><div><h2 className="text-base font-semibold">{name}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><ArrowRight className="size-4 text-muted-foreground" /></>;
    return <Link key={name} to={item.to} className="organic-divider grid min-h-20 grid-cols-[2.75rem_1fr_auto] items-center gap-4 py-4">{content}</Link>;
  })}{!signedIn && <Button asChild variant="outline" className="mt-6 w-full"><Link to="/auth"><UserRound />Sign in or create account</Link></Button>}</section><ToolTabBar /></main>;
}