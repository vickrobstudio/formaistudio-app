import { createFileRoute } from "@tanstack/react-router";
import { DashboardDetail } from "@/components/DashboardDetail";

export const Route = createFileRoute("/_authenticated/account")({ component: AccountPage });

function AccountPage() {
  const user = Route.useRouteContext().user;
  return <DashboardDetail eyebrow="Profile" title="Account" description="Your FormAI STUDIO account details."><div className="border-y border-border py-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Email</p><p className="mt-2 text-sm">{user.email}</p></div></DashboardDetail>;
}