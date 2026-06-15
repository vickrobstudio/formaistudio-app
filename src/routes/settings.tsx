import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeDollarSign, CircleHelp, CreditCard, FileText, Info, LockKeyhole, ReceiptText, Settings, WalletCards } from "lucide-react";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { useCredits } from "@/hooks/use-credits";

const settingsLinks = [
  { icon: WalletCards, label: "Wallet & payment methods", to: "/wallet" },
  { icon: BadgeDollarSign, label: "Subscriptions", note: "Active & cancelled", to: "/wallet" },
  { icon: ReceiptText, label: "Receipts", to: "/wallet" },
  { icon: Info, label: "About FormAI STUDIO", to: "/about" },
  { icon: FileText, label: "Terms & conditions", to: "/terms" },
  { icon: LockKeyhole, label: "Privacy", to: "/privacy" },
  { icon: CircleHelp, label: "Contact & help", to: "/contact" },
] as const;

export const Route = createFileRoute("/settings")({ head: () => ({ meta: [{ title: "Settings — FormAI STUDIO" }, { name: "description", content: "Manage billing, subscriptions, receipts, legal information and support." }] }), component: SettingsPage });

function SettingsPage() {
  const { credits, signedIn, vip } = useCredits();
  return <main className="min-h-screen bg-background"><FormaHeader /><PageIntro eyebrow="Account controls" title="Settings" description="Manage your wallet, billing information, subscriptions, receipts and app information." /><section className="px-5 pb-[calc(7rem+env(safe-area-inset-bottom))]"><div className="organic-divider grid grid-cols-[2.75rem_1fr] gap-4 py-5"><span className="grid size-11 place-items-center rounded-full border border-border"><CreditCard className="size-5" /></span><span><span className="block text-sm">{vip ? "VIP unlimited" : `${credits} credits available`}</span><span className="mt-1 block text-xs text-muted-foreground">{signedIn ? "Account wallet" : "Sign in to manage payments and subscriptions"}</span></span></div>{settingsLinks.map(({ icon: Icon, label, to, ...item }) => <Link key={label} to={to} className="organic-divider grid min-h-16 grid-cols-[2.75rem_1fr_auto] items-center gap-3 py-3"><Icon className="size-5" /><span className="text-sm">{label}</span>{"note" in item && <span className="text-[10px] text-muted-foreground">{item.note}</span>}</Link>)}<div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground"><Settings className="size-4" /><span>FormAI STUDIO · © 2026 VICK ROB INC</span></div></section><ToolTabBar /></main>;
}