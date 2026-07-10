import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Use — FormAI STUDIO" }, { name: "description", content: "Terms governing use of the FormAI STUDIO app and AI design tools." }, { property: "og:title", content: "FormAI STUDIO Terms of Use" }, { property: "og:description", content: "Review the terms governing FormAI STUDIO and its AI design tools." }] }),
  component: TermsPage,
});

function TermsPage() {
  return <LegalPage title="Terms of Use" updated="June 15, 2026">
    <LegalSection title="Using FormAI STUDIO"><p>You may use the app only for lawful purposes and in accordance with these terms. You are responsible for your account and activity performed through it.</p></LegalSection>
    <LegalSection title="Uploaded content"><p>You confirm that you own or have permission to upload every plan, image, model, and other file you submit. You grant us the limited rights needed to process that content and provide the service.</p></LegalSection>
    <LegalSection title="AI-generated results"><p>AI outputs may be incomplete, inaccurate, or unexpected. They are visualization concepts, not construction documents or professional architectural, engineering, legal, or safety advice. Review results before relying on them.</p></LegalSection>
    <LegalSection title="Credits and availability"><p>Credits, subscriptions, and feature access are governed by the terms shown at purchase. We may maintain, update, suspend, or discontinue features when reasonably necessary.</p></LegalSection>
    <LegalSection title="Auto-renewable subscriptions"><p>FormAI STUDIO offers auto-renewable monthly subscriptions: FormAI Pro ($44.99/month) unlocks every tool, and individual tool plans range from $4.99 to $19.99 per month. Payment is charged to your Apple ID account at confirmation of purchase. Each subscription automatically renews for the same one-month period at the price shown unless auto-renew is turned off at least 24 hours before the end of the current period. Your account is charged for renewal within 24 hours prior to the end of the current period. You can manage your subscriptions and turn off auto-renewal in your Apple ID account settings at any time. Any unused portion of a free trial, if offered, is forfeited when you purchase a subscription.</p></LegalSection>
    <LegalSection title="Prohibited activity"><p>Do not misuse the service, interfere with its operation, attempt unauthorized access, upload unlawful content, or use outputs in a way that violates another person’s rights.</p></LegalSection>
    <LegalSection title="Liability"><p>To the extent permitted by law, the service is provided without guarantees of uninterrupted availability or fitness for a specific professional purpose.</p></LegalSection>
  </LegalPage>;
}