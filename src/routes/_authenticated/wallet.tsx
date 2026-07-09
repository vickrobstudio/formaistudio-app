import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CreditCard, RotateCcw, Sparkles } from "lucide-react";
import { DashboardDetail } from "@/components/DashboardDetail";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/use-credits";
import { isNativeIOS, restorePurchases } from "@/lib/iap";

export const Route = createFileRoute("/_authenticated/wallet")({ component: WalletPage });

function WalletPage() {
  const { credits, vip } = useCredits();
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function handleRestore() {
    setRestoring(true);
    setRestoreMsg(null);
    const res = await restorePurchases();
    setRestoring(false);
    setRestoreMsg(res.ok ? "Purchases restored." : res.error ?? "Nothing to restore.");
  }

  return <DashboardDetail eyebrow="Billing" title="Wallet" description="Credits, purchases and billing information.">
    <section className="space-y-6 pb-8">
      <div className="rounded-3xl border border-border bg-secondary p-6 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Available credits</p>
        <p className="mt-2 text-5xl font-semibold">{vip ? "∞" : credits}</p>
        <p className="mt-2 text-xs text-muted-foreground">{vip ? "VIP · unlimited access" : "Credits are used each time you generate with a tool."}</p>
      </div>

      {!vip && <Button asChild variant="studio" className="h-12 w-full">
        <Link to="/pricing"><Sparkles className="size-4" />View plans &amp; subscribe</Link>
      </Button>}

      {isNativeIOS() && <div className="text-center">
        <Button type="button" variant="ghost" className="h-11" disabled={restoring} onClick={() => void handleRestore()}>
          <RotateCcw className="size-4" />{restoring ? "Restoring…" : "Restore purchases"}
        </Button>
        {restoreMsg && <p className="mt-1 text-xs text-muted-foreground">{restoreMsg}</p>}
      </div>}

      <Link to="/pricing" className="organic-divider grid min-h-16 grid-cols-[2.75rem_1fr_auto] items-center gap-3 py-3">
        <CreditCard className="size-5" />
        <span className="text-sm">Plans &amp; subscriptions</span>
        <span className="text-xs text-muted-foreground">View</span>
      </Link>
    </section>
  </DashboardDetail>;
}
