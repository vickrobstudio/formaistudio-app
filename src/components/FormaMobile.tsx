import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Box, Camera, Film, ImagePlus, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import formaiLogo from "@/assets/formai-metallic-logo-isolated.png.asset.json";

const tools = [
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/model-to-ai", label: "3D to AI", icon: Box },
  { to: "/ai-edits", label: "Edits", icon: ImagePlus },
  { to: "/photo-to-ai", label: "Photo", icon: Camera },
  { to: "/ai-to-video", label: "Video", icon: Film },
] as const;

export function FormAILogo({ className = "h-12" }: { className?: string }) {
  return (
    <span className={`relative block aspect-[1.36] overflow-hidden ${className}`}>
      <img
        src={formaiLogo.url}
        alt="FormAI logo"
        className="absolute -left-[58%] -top-[42%] h-auto w-[206%] max-w-none"
      />
    </span>
  );
}

export function FormaHeader({ transparent = false }: { transparent?: boolean }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] transform-gpu items-center px-[max(1.25rem,env(safe-area-inset-left))] pb-0 pt-[env(safe-area-inset-top)] ${transparent ? "text-primary-foreground" : "border-b border-border bg-background/95 text-foreground backdrop-blur"}`}>
        <Link to="/" aria-label="FormAI STUDIO home"><FormAILogo /></Link>
      </header>
      {path !== "/" && <div className="h-[calc(4rem+env(safe-area-inset-top))]" />}
    </>
  );
}

export function PageIntro({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <section className="px-5 pb-8 pt-9"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p><h1 className="mt-3 max-w-sm text-4xl font-light leading-[1.05] tracking-tight">{title}</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>{children}</section>;
}

export function ToolTabBar() {
  return (
    <nav aria-label="Creative tools" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {tools.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground transition-colors active:scale-[0.96] [&[data-status=active]]:text-foreground"
          >
            <Icon className="size-[22px]" strokeWidth={1.8} />
            <span className="text-[10px] font-semibold leading-none">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function BackLink({ to = "/dashboard", label = "Back to Dashboard" }: { to?: "/" | "/dashboard"; label?: string }) {
  return <Link to={to} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><ArrowLeft className="size-4" />{label}</Link>;
}