import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Cloud, FileClock, LogOut, ScrollText, ShieldCheck, UserRound, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormaHeader, PageIntro } from "@/components/FormaMobile";
import { supabase } from "@/integrations/supabase/client";

const dashboardItems = [
  { icon: UserRound, name: "Account", description: "Profile, email and account settings", to: "/account" },
  { icon: Cloud, name: "Cloud", description: "Saved projects, images and products", to: "/cloud" },
  { icon: FileClock, name: "History", description: "Your recent creations and activity", to: "/history" },
  { icon: WalletCards, name: "Wallet", description: "Credits, purchases and billing", to: "/wallet" },
  { icon: ScrollText, name: "Terms & Conditions", description: "Rules for using FormAI STUDIO", to: "/terms" },
  { icon: ShieldCheck, name: "Privacy", description: "How your information is protected", to: "/privacy" },
] as const;

export const Route = createFileRoute("/_authenticated/dashboard")({ head: () => ({ meta: [{ title: "Dashboard — FormAI STUDIO" }, { name: "description", content: "Manage your account, cloud, history and wallet." }, { property: "og:title", content: "FormAI STUDIO Dashboard" }, { property: "og:description", content: "Your private FormAI STUDIO dashboard." }] }), component: Dashboard });

function Dashboard() {
  const navigate = useNavigate();
  const user = Route.useRouteContext().user;
  async function signOut() { await supabase.auth.signOut(); void navigate({ to: "/auth", replace: true }); }
  return <main className="min-h-screen bg-background"><FormaHeader /><PageIntro eyebrow="Your space" title="Dashboard" description={user.email ?? "Manage your FormAI STUDIO account."} /><section className="border-t border-border px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">{dashboardItems.map(({ icon: Icon, name, description, ...item }) => {
    const content = <><div className="grid size-11 place-items-center rounded-full bg-foreground text-background"><Icon className="size-5" /></div><div><h2 className="text-base font-semibold">{name}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><ArrowRight className="size-4 text-muted-foreground" /></>;
    return <Link key={name} to={item.to} className="grid min-h-20 grid-cols-[2.75rem_1fr_auto] items-center gap-4 border-b border-border py-4">{content}</Link>;
  })}<Button variant="outline" className="mt-6 w-full" onClick={signOut}><LogOut />Sign out</Button></section></main>;
}