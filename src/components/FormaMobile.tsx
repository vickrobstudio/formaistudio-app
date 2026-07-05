import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Grid2X2, House, Sparkles, UserRound } from "lucide-react";
import type { ReactNode } from "react";
const formaiLogoWhite = "/formai-logo-white.png";

const tools = [
  { to: "/feed", label: "Home", icon: House },
  { to: "/tools", label: "Tools", icon: Grid2X2 },
  { to: "/create", label: "Create", icon: Sparkles },
  { to: "/dashboard", label: "Profile", icon: UserRound },
] as const;

export function FormAILogo({ className = "w-16" }: { inverse?: boolean; className?: string }) {
  return (
    <img
      src={formaiLogoWhite}
      alt="FormAI logo"
      className={`${className} h-auto object-contain`}
    />
  );
}

export function FormaHeader({ transparent = false }: { transparent?: boolean }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-50 mx-auto flex h-[calc(3.25rem+env(safe-area-inset-top))] w-full max-w-full transform-gpu items-center justify-center px-[max(1rem,env(safe-area-inset-left))] pb-0 pt-[env(safe-area-inset-top)] ${transparent ? "text-primary-foreground" : "border-b border-border bg-background/90 text-foreground shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 md:border-b-0 md:shadow-none"}`}>
        <Link to="/" aria-label="Return to FormAI STUDIO landing page" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <FormAILogo inverse className="w-12" />
        </Link>
      </header>
      {path !== "/" && <div className="h-[calc(3.25rem+env(safe-area-inset-top))]" />}
    </>
  );
}

export function PageIntro({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <section className="px-5 pb-8 pt-9"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p><h1 className="mt-3 max-w-sm text-4xl font-light leading-[1.05] tracking-tight">{title}</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>{children}</section>;
}

export function ToolTabBar() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const isActive = (label: string, to: string) => {
    if (label === "Tools") return ["/tools", "/studio", "/model-to-ai", "/2d-to-3d", "/ai-edits", "/photo-to-ai", "/ai-to-video"].includes(path);
    if (label === "Profile") return ["/dashboard", "/account", "/cloud", "/history", "/settings", "/wallet", "/about", "/terms", "/privacy", "/contact"].includes(path);
    return path === to;
  };
  return (
    <nav aria-label="Creative tools" className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-full border-t border-border bg-background/95 px-[max(0.5rem,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:border-t-0">
      <div className="mx-auto grid h-16 max-w-xl grid-cols-4">
        {tools.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            aria-current={isActive(label, to) ? "page" : undefined}
            className={`relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl transition-[color,transform] active:scale-[0.96] ${isActive(label, to) ? "font-bold text-[oklch(0.65_0_0)]" : "font-normal text-muted-foreground"}`}
          >
            <Icon className="size-[22px]" strokeWidth={isActive(label, to) ? 2.4 : 1.7} />
            <span className={`text-[10px] leading-none ${isActive(label, to) ? "font-bold" : "font-normal"}`}>{label}</span>
            {isActive(label, to) && <span aria-hidden="true" className="absolute bottom-0 h-0.5 w-5 rounded-full bg-[oklch(0.65_0_0)]" />}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function BackLink({ label = "Back" }: { to?: "/" | "/dashboard"; label?: string }) {
  const router = useRouter();
  return <button type="button" onClick={() => router.history.back()} className="inline-flex min-h-11 items-center gap-2 rounded-xl text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><ArrowLeft className="size-4" />{label}</button>;
}