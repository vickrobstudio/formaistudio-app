import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Box, Camera, ChevronRight, Cloud, Film, ImagePlus, Menu, Sparkles, UserRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import formaiLogo from "@/assets/formai-official-logo.png.asset.json";

const tools = [
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/model-to-ai", label: "3D to AI", icon: Box },
  { to: "/ai-edits", label: "Edits", icon: ImagePlus },
  { to: "/photo-to-ai", label: "Photo", icon: Camera },
  { to: "/ai-to-video", label: "Video", icon: Film },
] as const;

export function FormAILogo({ inverse = false, className = "h-21" }: { inverse?: boolean; className?: string }) {
  return (
    <img
      src={formaiLogo.url}
      alt="FormAI logo"
      className={`${className} w-auto object-contain ${inverse ? "brightness-0 invert" : ""}`}
    />
  );
}

export function FormaHeader({ transparent = false }: { transparent?: boolean }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between px-[max(1.25rem,env(safe-area-inset-left))] pb-0 pt-[env(safe-area-inset-top)] ${transparent ? "text-primary-foreground" : "border-b border-border bg-background/95 text-foreground backdrop-blur"}`}>
        <Link to="/" aria-label="FormAI STUDIO home"><FormAILogo inverse={transparent} /></Link>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className={transparent ? "hover:bg-background/15 hover:text-primary-foreground" : ""} onClick={() => setOpen(true)}><Menu className="size-6" /></Button>
      </header>
      {open && <div className="fixed inset-0 z-50 bg-foreground text-background">
        <div className="flex h-16 items-center justify-between px-5"><FormAILogo inverse /><Button variant="ghost" size="icon" aria-label="Close navigation" className="text-background hover:bg-background/10 hover:text-background" onClick={() => setOpen(false)}><X className="size-6" /></Button></div>
        <nav className="flex h-[calc(100%-4rem)] flex-col px-6 pb-8 pt-8">
          <Link to="/dashboard" onClick={() => setOpen(false)} className="border-b border-background/15 py-4 text-2xl font-light">Dashboard</Link>
          {tools.map((tool) => <Link key={tool.to} to={tool.to} onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-background/15 py-4 text-xl font-light"><span>{tool.label}</span><ChevronRight className="size-4" /></Link>)}
          <div className="mt-auto grid grid-cols-2 gap-2">
            <Link to="/cloud" onClick={() => setOpen(false)} className="flex flex-col items-center gap-2 py-3 text-xs"><Cloud /><span>My Cloud</span></Link>
            <Link to="/auth" onClick={() => setOpen(false)} className="flex flex-col items-center gap-2 py-3 text-xs"><UserRound /><span>Account</span></Link>
          </div>
        </nav>
      </div>}
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