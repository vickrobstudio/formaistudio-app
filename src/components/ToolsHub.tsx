import { Link, useNavigate } from "@tanstack/react-router";
import { Box, Boxes, Camera, Film, ImagePlus, Lock, Sparkles } from "lucide-react";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { useCredits } from "@/hooks/use-credits";
import { useSubscription } from "@/hooks/use-subscription";
import { FREE_TOOLS, PLAN_BY_ID, type PlanId } from "@/lib/plans";

const tools = [
  { icon: Boxes, name: "2D to 3D", tagline: "Plan → 3D model", to: "/2d-to-3d", plan: "tool_2d_to_3d_monthly" as PlanId },
  { icon: Sparkles, name: "Studio AI", tagline: "Furnish a space", to: "/studio", plan: "tool_studio_ai_monthly" as PlanId },
  { icon: Box, name: "3D to AI", tagline: "Render any view", to: "/model-to-ai", plan: "tool_model_to_ai_monthly" as PlanId },
  { icon: ImagePlus, name: "AI Edits", tagline: "Edit & relight", to: "/ai-edits", plan: "tool_ai_edits_monthly" as PlanId },
  { icon: Camera, name: "Photo to AI", tagline: "Chat with a photo", to: "/photo-to-ai", plan: null },
  { icon: Film, name: "AI to Video", tagline: "10s virtual tour", to: "/ai-to-video", plan: "tool_ai_to_video_monthly" as PlanId },
] as const;

export function ToolsHub() {
  const navigate = useNavigate();
  const { credits, signedIn, vip } = useCredits();
  const sub = useSubscription();

  // A tool is available if it's free, the member is unlimited, their
  // subscription unlocks it, or they still have trial/account credits to spend.
  function isUnlocked(to: string): boolean {
    return FREE_TOOLS.includes(to) || vip || sub.hasTool(to) || credits > 0;
  }

  function openTool(to: string) {
    if (isUnlocked(to)) { void navigate({ to }); return; }
    // Out of credits with no subscription: guests sign up first; signed-in
    // members land in their account's Plans & Subscriptions hub to subscribe.
    if (!signedIn) void navigate({ to: "/auth", search: { redirect: "/wallet" } as never });
    else void navigate({ to: "/wallet" });
  }

  return <main className="dashboard-theme min-h-screen bg-background text-foreground"><FormaHeader /><PageIntro eyebrow="Tools" title="Pick a tool" description="One workflow per tool. Tap to start.">
    <p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip || sub.isActive ? "Subscribed · unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p>
    {!vip && !sub.isActive && <Link to="/pricing" className="mt-2 inline-block text-xs underline">Unlock every tool with Pro — ${PLAN_BY_ID.pro_monthly.priceUsd}/mo</Link>}
  </PageIntro><section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:mx-auto md:w-full md:max-w-3xl lg:max-w-4xl">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tools.map(({ icon: Icon, name, tagline, to, plan }) => {
        const free = FREE_TOOLS.includes(to);
        const unlocked = isUnlocked(to);
        const priceLabel = free ? "Free" : `$${PLAN_BY_ID[plan!].priceUsd}/mo`;
        return <button key={to} type="button" onClick={() => openTool(to)} className="group relative flex aspect-square flex-col justify-between rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent">
          <div className="flex w-full items-start justify-between">
            <Icon className="size-6" />
            {!unlocked && <Lock className="size-4 text-muted-foreground" />}
          </div>
          <span className="block">
            <span className="block text-sm font-semibold leading-tight">{name}</span>
            <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{tagline}</span>
            <span className={`mt-1.5 block text-[11px] font-bold uppercase tracking-wide ${free ? "text-muted-foreground" : "text-foreground"}`}>{priceLabel}</span>
          </span>
        </button>;
      })}
    </div>
  </section><ToolTabBar /></main>;
}
