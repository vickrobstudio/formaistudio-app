import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { FormAILogo } from "@/components/FormaMobile";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="relative flex min-h-20 items-center justify-end border-b border-border px-[max(1.25rem,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)]">
        <Link to="/" aria-label="FormAI home" className="absolute left-1/2 -translate-x-1/2"><FormAILogo inverse className="w-16" /></Link>
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-xs uppercase tracking-[0.12em] text-muted-foreground"><ArrowLeft className="size-4" />Home</Link>
      </header>
      <article className="mx-auto max-w-2xl px-5 py-12 pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl leading-tight">{title}</h1>
        <p className="mt-3 text-xs text-muted-foreground">Last updated: {updated}</p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">{children}</div>
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="text-base text-foreground">{title}</h2><div className="mt-2 space-y-3">{children}</div></section>;
}