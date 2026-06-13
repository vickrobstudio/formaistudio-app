import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Cloud, Home, Menu, UserRound, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const tools = [
  { to: "/studio", label: "Studio AI" },
  { to: "/model-to-ai", label: "3D to AI" },
  { to: "/ai-edits", label: "AI Edits" },
  { to: "/photo-to-ai", label: "Photo to AI" },
  { to: "/ai-to-video", label: "AI to Video" },
] as const;

function FormaWordmark({ inverse = false }: { inverse?: boolean }) {
  return <span className={`text-sm font-black tracking-[0.2em] ${inverse ? "text-primary-foreground" : "text-foreground"}`}>FormAI STUDIO</span>;
}

export function FormaHeader({ transparent = false }: { transparent?: boolean }) {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (state) => state.location.pathname });
  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between px-5 ${transparent ? "text-primary-foreground" : "border-b border-border bg-background/95 text-foreground backdrop-blur"}`}>
        <Link to="/" aria-label="FormAI STUDIO home"><FormaWordmark inverse={transparent} /></Link>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className={transparent ? "hover:bg-background/15 hover:text-primary-foreground" : ""} onClick={() => setOpen(true)}><Menu className="size-6" /></Button>
      </header>
      {open && <div className="fixed inset-0 z-50 bg-foreground text-background">
        <div className="flex h-16 items-center justify-between px-5"><FormaWordmark inverse /><Button variant="ghost" size="icon" aria-label="Close navigation" className="text-background hover:bg-background/10 hover:text-background" onClick={() => setOpen(false)}><X className="size-6" /></Button></div>
        <nav className="flex h-[calc(100%-4rem)] flex-col px-6 pb-8 pt-8">
          <Link to="/dashboard" onClick={() => setOpen(false)} className="border-b border-background/15 py-4 text-2xl font-light">Dashboard</Link>
          {tools.map((tool) => <Link key={tool.to} to={tool.to} onClick={() => setOpen(false)} className="flex items-center justify-between border-b border-background/15 py-4 text-xl font-light"><span>{tool.label}</span><ChevronRight className="size-4" /></Link>)}
          <div className="mt-auto grid grid-cols-3 gap-2">
            <Link to="/" onClick={() => setOpen(false)} className="flex flex-col items-center gap-2 py-3 text-xs"><Home /><span>Home</span></Link>
            <Link to="/cloud" onClick={() => setOpen(false)} className="flex flex-col items-center gap-2 py-3 text-xs"><Cloud /><span>My Cloud</span></Link>
            <Link to="/auth" onClick={() => setOpen(false)} className="flex flex-col items-center gap-2 py-3 text-xs"><UserRound /><span>Account</span></Link>
          </div>
        </nav>
      </div>}
      {path !== "/" && <div className="h-16" />}
    </>
  );
}

export function PageIntro({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <section className="px-5 pb-8 pt-9"><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">{eyebrow}</p><h1 className="mt-3 max-w-sm text-4xl font-light leading-[1.05] tracking-tight">{title}</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>{children}</section>;
}

export function BackLink({ to = "/dashboard", label = "Back to Dashboard" }: { to?: "/" | "/dashboard"; label?: string }) {
  return <Link to={to} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"><ArrowLeft className="size-4" />{label}</Link>;
}