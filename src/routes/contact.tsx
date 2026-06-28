import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "Contact — FormAI STUDIO" }, { name: "description", content: "Contact FormAI STUDIO about support, privacy, billing, or account questions." }, { property: "og:title", content: "Contact FormAI STUDIO" }, { property: "og:description", content: "Get help with FormAI STUDIO support, privacy, billing, and account questions." }] }),
  component: ContactPage,
});

function ContactPage() {
  return <LegalPage title="Contact" updated="June 15, 2026">
    <LegalSection title="How can we help?"><p>For app support, account questions, billing concerns, privacy requests, or reports about content, use the in-app account area after signing in.</p></LegalSection>
    <LegalSection title="Email us"><p>You can reach us directly at <a href="mailto:hello@vickrob.com" className="underline">hello@vickrob.com</a>. We typically reply within 2 business days.</p></LegalSection>
    <LegalSection title="Before contacting us"><p>Please include the email associated with your account, the tool you were using, and a concise description of the issue. Do not send passwords, payment details, or other sensitive credentials.</p></LegalSection>
    <Link to="/auth" className="inline-flex min-h-11 items-center rounded-lg border border-border px-5 text-sm text-foreground">Sign in to your account</Link>
  </LegalPage>;
}