import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Upload } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { ToolInformation, type ToolInfoSection } from "@/components/ToolInformation";
import { useCredits } from "@/hooks/use-credits";

export function ToolEntry({ eyebrow, title, description, steps, accept, cta, information }: { eyebrow: string; title: string; description: string; steps: string[]; accept: string; cta: string; information?: ToolInfoSection[] }) {
  const { credits, signedIn, vip, consume } = useCredits();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  async function start() { if (!(await consume())) { if (!signedIn) { void navigate({ to: "/auth" }); return; } setMessage("You have no credits left. Open your Wallet to continue."); return; } setMessage("Credit applied. This tool is ready for your upload."); }
  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink /></div><PageIntro eyebrow={eyebrow} title={title} description={description}><p className="mt-4 text-xs font-bold uppercase tracking-[0.14em]">{vip ? "VIP · Unlimited" : `${credits} ${signedIn ? "account" : "guest"} credits left`}</p></PageIntro><section className="px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]"><button type="button" className="flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-foreground bg-background px-8 text-center active:scale-[0.99]"><span className="grid size-12 place-items-center rounded-full bg-foreground text-background"><Upload className="size-5" /></span><span className="mt-4 text-sm font-bold">Click to upload or drag and drop</span><span className="mt-2 text-xs text-muted-foreground">{accept}</span></button><div className="mt-8"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">How it works</p>{steps.map((step, index) => <div key={step} className="organic-divider grid grid-cols-[2rem_1fr] gap-3 py-4"><span className="text-xs text-primary">0{index + 1}</span><p className="text-sm">{step}</p></div>)}</div>{message && <p role="status" className="mt-5 text-xs text-muted-foreground">{message}</p>}<Button variant="studio" className="mt-8 h-12 w-full justify-between" onClick={() => void start()}><span>{cta}</span><ArrowRight /></Button>{information && <ToolInformation sections={information} />}</section><ToolTabBar /></main>;
}