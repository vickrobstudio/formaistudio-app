import { createFileRoute } from "@tanstack/react-router";
import { DashboardDetail } from "@/components/DashboardDetail";

export const Route = createFileRoute("/_authenticated/wallet")({ component: () => <DashboardDetail eyebrow="Billing" title="Wallet" description="Credits, purchases and billing information."><p className="border-y border-border py-8 text-center text-sm text-muted-foreground">No wallet activity yet.</p></DashboardDetail> });