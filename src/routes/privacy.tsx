import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy — FormAI Studio" }, { name: "description", content: "How FormAI Studio collects, uses, and protects your information." }, { property: "og:title", content: "FormAI Studio Privacy Policy" }, { property: "og:description", content: "Learn how FormAI Studio collects, uses, and protects your information." }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return <LegalPage title="Privacy Policy" updated="September 17, 2026">
    <LegalSection title="Information we collect"><p>We collect account details you provide, files and room information you upload, prompts, generated project content, subscription or credit status, and basic technical data needed to operate, secure, and improve the app.</p></LegalSection>
    <LegalSection title="How we use information"><p>We use your information to provide AI design tools, save your projects, manage credits and accounts, process subscriptions, improve app reliability, prevent misuse, troubleshoot issues, and respond to support requests.</p></LegalSection>
    <LegalSection title="AI processing and third-party AI providers"><p>With your consent, FormAI Studio sends the selected images, plans, drawings, photographs and relevant text to OpenAI for image generation, drawing analysis and assistant responses. If you choose mesh reconstruction, selected images are sent to Replicate. The app identifies these providers and requests permission before the first transmission. If you decline, the AI action does not proceed. Do not upload confidential material unless you have permission to share it with the selected provider.</p></LegalSection>
    <LegalSection title="No tracking"><p>We do not track you across apps or websites owned by other companies. We do not sell your personal information. We do not share your personal information with data brokers. We do not use your personal information for third-party targeted advertising or advertising measurement.</p></LegalSection>
    <LegalSection title="Your content"><p>Your plans, photographs, prompts, uploaded files, room information, and generated results remain associated with your account and are not made public by default. Only upload content you own or have permission to use.</p></LegalSection>
    <LegalSection title="Third-party services"><p>We may use trusted service providers to help operate the app, including cloud hosting, authentication, payment processing, analytics, crash reporting, AI processing, and customer support. These providers are used only to provide, secure, maintain, and improve the app, and not to track users for advertising purposes.</p></LegalSection>
    <LegalSection title="Retention and security"><p>We retain information for as long as needed to provide the service, maintain your account and projects, comply with legal obligations, resolve disputes, prevent misuse, and enforce our agreements. You may request deletion of your account or personal information. Some records may be retained where required by law, security, fraud prevention, billing, or legitimate business needs.</p></LegalSection>
    <LegalSection title="Your choices"><p>You may request access, correction, export, or deletion of your personal information through the Contact page. You may also manage or cancel subscriptions through your Apple ID subscription settings.</p></LegalSection>
  </LegalPage>;
}
