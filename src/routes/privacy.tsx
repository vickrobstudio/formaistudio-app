import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — FormAI STUDIO" }, { name: "description", content: "How FormAI STUDIO collects, uses, and protects your information." }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPage title="Privacy Policy" updated="June 15, 2026">
    <LegalSection title="Information we collect"><p>We collect account details you provide, files and room information you upload, generated project content, and basic technical data needed to operate and secure the app.</p></LegalSection>
    <LegalSection title="How we use information"><p>We use your information to provide AI design tools, save your projects, manage credits and accounts, improve reliability, prevent misuse, and respond to support requests.</p></LegalSection>
    <LegalSection title="Your content"><p>Your plans, photographs, prompts, and generated results remain associated with your account and are not made public by default. Only upload content you have permission to use.</p></LegalSection>
    <LegalSection title="Retention and security"><p>We retain information for as long as needed to provide the service and meet legal obligations. We use reasonable safeguards, but no online service can guarantee absolute security.</p></LegalSection>
    <LegalSection title="Your choices"><p>You may request access, correction, export, or deletion of your personal information through the Contact page. Some records may be retained where legally required.</p></LegalSection>
  </LegalPage>;
}