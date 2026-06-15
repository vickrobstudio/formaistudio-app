import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Use — FormAI STUDIO" }, { name: "description", content: "Terms governing use of the FormAI STUDIO app and AI design tools." }] }),
  component: TermsPage,
});

function TermsPage() {
  return <LegalPage title="Terms of Use" updated="June 15, 2026">
    <LegalSection title="Using FormAI STUDIO"><p>You may use the app only for lawful purposes and in accordance with these terms. You are responsible for your account and activity performed through it.</p></LegalSection>
    <LegalSection title="Uploaded content"><p>You confirm that you own or have permission to upload every plan, image, model, and other file you submit. You grant us the limited rights needed to process that content and provide the service.</p></LegalSection>
    <LegalSection title="AI-generated results"><p>AI outputs may be incomplete, inaccurate, or unexpected. They are visualization concepts, not construction documents or professional architectural, engineering, legal, or safety advice. Review results before relying on them.</p></LegalSection>
    <LegalSection title="Credits and availability"><p>Credits, subscriptions, and feature access are governed by the terms shown at purchase. We may maintain, update, suspend, or discontinue features when reasonably necessary.</p></LegalSection>
    <LegalSection title="Prohibited activity"><p>Do not misuse the service, interfere with its operation, attempt unauthorized access, upload unlawful content, or use outputs in a way that violates another person’s rights.</p></LegalSection>
    <LegalSection title="Liability"><p>To the extent permitted by law, the service is provided without guarantees of uninterrupted availability or fitness for a specific professional purpose.</p></LegalSection>
  </LegalPage>;
}