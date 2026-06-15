import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { FormAILogo, ToolTabBar } from "@/components/FormaMobile";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 flex h-[calc(3.25rem+env(safe-area-inset-top))] items-center border-b border-border bg-background/90 px-[max(1rem,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-xl">
        <Link to="/" aria-label="FormAI home" className="absolute left-1/2 -translate-x-1/2"><FormAILogo inverse className="w-16" /></Link>
        <button type="button" onClick={() => router.history.back()} className="inline-flex min-h-11 items-center gap-2 rounded-xl text-xs uppercase tracking-[0.12em] text-muted-foreground"><ArrowLeft className="size-4" />Back</button>
      </header>
      <article className="mx-auto max-w-2xl px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(6.25rem+env(safe-area-inset-top))]">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl leading-tight">{title}</h1>
        <p className="mt-3 text-xs text-muted-foreground">Last updated: {updated}</p>
        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">{children}</div>
      </article>
      <ToolTabBar />
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="text-base text-foreground">{title}</h2><div className="mt-2 space-y-3">{children}</div></section>;
}