import { BackLink, FormaHeader, PAGE_SHELL, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import type { ReactNode } from "react";

export function DashboardDetail({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <main className="min-h-screen bg-background"><FormaHeader /><div className={`${PAGE_SHELL} px-5 pt-4`}><BackLink /></div><PageIntro eyebrow={eyebrow} title={title} description={description} /><section className={`${PAGE_SHELL} px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]`}>{children}</section><ToolTabBar /></main>;
}
