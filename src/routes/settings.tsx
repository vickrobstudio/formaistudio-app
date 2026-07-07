import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { BadgeDollarSign, CircleHelp, CreditCard, FileText, Info, Instagram, LockKeyhole, LogOut, ReceiptText, Settings, WalletCards } from "lucide-react";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/use-credits";
import { useInstagramConnection } from "@/hooks/use-instagram-connection";
import { completeInstagramConnect, disconnectInstagram, startInstagramConnect } from "@/lib/instagram-connect.functions";
import { supabase } from "@/integrations/supabase/client";

const settingsLinks = [
  { icon: WalletCards, label: "Wallet & payment methods", to: "/wallet" },
  { icon: BadgeDollarSign, label: "Subscriptions", note: "Active & cancelled", to: "/wallet" },
  { icon: ReceiptText, label: "Receipts", to: "/wallet" },
  { icon: Info, label: "About FormAI STUDIO", to: "/about" },
  { icon: FileText, label: "Terms & conditions", to: "/terms" },
  { icon: LockKeyhole, label: "Privacy", to: "/privacy" },
  { icon: CircleHelp, label: "Contact & help", to: "/contact" },
] as const;

export const Route = createFileRoute("/settings")({
  // code/state/error are Meta's own OAuth redirect params (Meta sends the
  // browser straight back here — see instagram-oauth.server.ts).
  validateSearch: (search: Record<string, unknown>): { code?: string; state?: string; error?: string } => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  head: () => ({ meta: [{ title: "Settings — FormAI STUDIO" }, { name: "description", content: "Manage billing, subscriptions, receipts, legal information and support." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { credits, signedIn, vip } = useCredits();
  const { connected: instagramConnected, username: instagramUsername } = useInstagramConnection();
  const startInstagramConnectFn = useServerFn(startInstagramConnect);
  const completeInstagramConnectFn = useServerFn(completeInstagramConnect);
  const disconnectInstagramFn = useServerFn(disconnectInstagram);
  const [instagramBusy, setInstagramBusy] = useState(false);
  const [instagramOverride, setInstagramOverride] = useState<{ connected: boolean; username: string | null } | null>(null);
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { code, state, error: oauthError } = Route.useSearch();
  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  }
  useEffect(() => {
    if (oauthError) {
      setInstagramError("Instagram connection was cancelled.");
      window.history.replaceState(null, "", "/settings");
      return;
    }
    if (!code || !state) return;
    setInstagramBusy(true);
    void (async () => {
      try {
        const result = await completeInstagramConnectFn({ data: { code, state } });
        setInstagramOverride({ connected: true, username: result.username });
        setInstagramError(null);
      } catch (cause) {
        setInstagramError(cause instanceof Error ? cause.message : "Could not connect Instagram.");
      } finally {
        setInstagramBusy(false);
        window.history.replaceState(null, "", "/settings");
      }
    })();
    // Runs once for the code/state this page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function connectInstagram() {
    setInstagramBusy(true);
    try {
      const { authorizeUrl } = await startInstagramConnectFn();
      // target=_blank so Capacitor's iOS shell hands the Facebook Login
      // dialog to the system browser instead of blocking in-app navigation
      // to a domain outside allowNavigation.
      window.open(authorizeUrl, "_blank", "noopener,noreferrer");
    } finally {
      setInstagramBusy(false);
    }
  }
  async function disconnectInstagramAccount() {
    setInstagramBusy(true);
    try { await disconnectInstagramFn(); setInstagramOverride({ connected: false, username: null }); setInstagramError(null); }
    finally { setInstagramBusy(false); }
  }
  const isConnected = instagramOverride ? instagramOverride.connected : instagramConnected;
  const displayUsername = instagramOverride ? instagramOverride.username : instagramUsername;
  return <main className="min-h-screen bg-background"><FormaHeader /><PageIntro eyebrow="Account controls" title="Settings" description="Manage your wallet, billing information, subscriptions, receipts and app information." /><section className="px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] md:mx-auto md:w-full md:max-w-3xl lg:max-w-4xl"><div className="organic-divider grid grid-cols-[2.75rem_1fr] gap-4 py-5"><span className="grid size-11 place-items-center rounded-full border border-border"><CreditCard className="size-5" /></span><span><span className="block text-sm">{vip ? "VIP unlimited" : `${credits} credits available`}</span><span className="mt-1 block text-xs text-muted-foreground">{signedIn ? "Account wallet" : "Sign in to manage payments and subscriptions"}</span></span></div>{signedIn && <div className="organic-divider grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 py-3"><span className="grid size-11 place-items-center rounded-full border border-border"><Instagram className="size-5" /></span><span><span className="block text-sm">Instagram</span><span className="mt-1 block text-xs text-muted-foreground">{isConnected ? `Connected as @${displayUsername}` : "Share your creations to your own Instagram"}</span>{instagramError && <span role="alert" className="mt-1 block text-xs text-destructive">{instagramError}</span>}</span>{isConnected ? <Button type="button" size="sm" variant="outline" disabled={instagramBusy} onClick={() => void disconnectInstagramAccount()}>Disconnect</Button> : <Button type="button" size="sm" variant="outline" disabled={instagramBusy} onClick={() => void connectInstagram()}>Connect</Button>}</div>}{settingsLinks.map(({ icon: Icon, label, to, ...item }) => <Link key={label} to={to} className="organic-divider grid min-h-16 grid-cols-[2.75rem_1fr_auto] items-center gap-3 py-3"><Icon className="size-5" /><span className="text-sm">{label}</span>{"note" in item && <span className="text-[10px] text-muted-foreground">{item.note}</span>}</Link>)}{signedIn && <Button type="button" variant="outline" className="mt-6 h-12 w-full" onClick={() => void signOut()}><LogOut className="size-4" />Sign out</Button>}<div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground"><Settings className="size-4" /><span>FormAI STUDIO · © 2026 VICK ROB INC</span></div></section><ToolTabBar /></main>;
}