import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Cloud, CreditCard, History, LogOut, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormaHeader, PAGE_SHELL, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { useCredits } from "@/hooks/use-credits";
import { supabase } from "@/integrations/supabase/client";

const dashboardItems = [
  { icon: CreditCard, name: "Plans & Subscriptions", description: "Your credits, plans, billing and subscriptions", to: "/wallet" },
  { icon: UserRound, name: "Account", description: "Profile and account details", to: "/account" },
  { icon: Cloud, name: "My Cloud", description: "Stored images, projects, products and materials", to: "/cloud" },
  { icon: History, name: "History", description: "Recent creations and activity", to: "/history" },
] as const;

export const Route = createFileRoute("/dashboard")({ head: () => ({ meta: [{ title: "Profile — FormAI Studio" }, { name: "description", content: "Manage your FormAI Studio profile, cloud library and activity." }, { property: "og:title", content: "FormAI Studio Profile" }, { property: "og:description", content: "Your account and creative cloud." }] }), component: Dashboard });

function Dashboard() {
  const { credits, signedIn, vip } = useCredits();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [sessionError, setSessionError] = useState("");
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSessionError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      await queryClient.cancelQueries();
      queryClient.clear();
      window.dispatchEvent(new Event("formai-credits-changed"));
      await navigate({ to: "/auth", replace: true });
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }
  return <main className="dashboard-theme min-h-screen bg-background text-foreground"><FormaHeader /><PageIntro eyebrow="Profile dashboard" title="Your account" description="Manage account details, saved images and projects, and recent activity."><p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p></PageIntro><section className={`${PAGE_SHELL} px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]`}><div className="md:grid md:grid-cols-3 md:gap-4">{signedIn && dashboardItems.map(({ icon: Icon, name, description, ...item }) => {
    const content = <><div className="grid size-11 place-items-center text-foreground"><Icon className="size-6" /></div><div><h2 className="text-base font-semibold">{name}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><ArrowRight className="size-4 text-muted-foreground" /></>;
    return <Link key={name} to={item.to} className="organic-divider grid min-h-20 grid-cols-[2.75rem_1fr_auto] items-center gap-4 py-4 md:rounded-2xl md:border md:border-border md:bg-card md:p-6 md:after:hidden">{content}</Link>;
  })}</div>{vip && <Button asChild variant="outline" className="mt-6"><Link to="/instagram-review">Instagram approval queue</Link></Button>}{signedIn && <Button variant="outline" className="mt-6 w-full md:max-w-sm" disabled={signingOut} onClick={() => void signOut()}><LogOut />{signingOut ? "Signing out…" : "Sign out / Cerrar sesión"}</Button>}{sessionError && <p role="alert" className="mt-3 text-sm text-destructive">{sessionError}</p>}{!signedIn && <Button asChild variant="outline" className="mt-6 w-full md:max-w-sm"><Link to="/auth"><UserRound />Sign in or create account</Link></Button>}</section><ToolTabBar /></main>;
}

