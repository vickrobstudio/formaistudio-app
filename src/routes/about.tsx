import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/LegalPage";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [
    { title: "About — FormAI STUDIO · For the architects of the world" },
    { name: "description", content: "FormAI STUDIO is the creative platform for architects, interior and furniture designers building 3D worlds and photorealistic renderings of their ideas. By VICK ROB INC." },
    { property: "og:title", content: "About FormAI STUDIO — For the architects of the world" },
    { property: "og:description", content: "The creative app for architects, interior and furniture designers — and every creator of 3D worlds. By VICK ROB INC." },
  ] }),
  component: AboutPage,
});

function AboutPage() {
  return <LegalPage title="About FormAI STUDIO" updated="June 15, 2026"><LegalSection title="Design without limits"><p>FormAI STUDIO is an AI-powered creative platform for custom furniture, interior concepts, photorealistic visualizations, image editing and virtual space tours.</p></LegalSection><LegalSection title="Built for real design work"><p>Our tools help designers and clients move from references and ideas to clear visual concepts while preserving materials, finishes, furniture intent and spatial context.</p></LegalSection><LegalSection title="Company"><p>FormAI STUDIO is a product of VICK ROB INC. © 2026 VICK ROB INC. All rights reserved.</p></LegalSection></LegalPage>;
}