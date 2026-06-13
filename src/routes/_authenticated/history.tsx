import { createFileRoute } from "@tanstack/react-router";
import { DashboardDetail } from "@/components/DashboardDetail";

export const Route = createFileRoute("/_authenticated/history")({ component: () => <DashboardDetail eyebrow="Activity" title="History" description="Your recent creations and activity."><p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p></DashboardDetail> });