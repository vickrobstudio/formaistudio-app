import { BackLink, FormaHeader, PageIntro } from "@/components/FormaMobile";
import type { ReactNode } from "react";

export function DashboardDetail({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink /></div><PageIntro eyebrow={eyebrow} title={title} description={description} /><section className="px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">{children}</section></main>;
}