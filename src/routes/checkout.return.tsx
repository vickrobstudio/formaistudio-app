import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({ meta: [{ title: "Payment complete — FormAI Studio" }] }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const { session_id } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          {session_id ? "You're all set." : "No session found."}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {session_id
            ? "Your FormAI Pro subscription is active. Credits have been added to your account."
            : "We couldn't locate your checkout session."}
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/studio" className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white hover:bg-black/85">
            Open Studio
          </Link>
          <Link to="/settings" className="rounded-full border px-6 py-3 text-sm font-medium hover:bg-muted">
            Account
          </Link>
        </div>
      </div>
    </div>
  );
}