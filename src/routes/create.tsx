import { createFileRoute } from "@tanstack/react-router";
import { FurnitureCreator } from "@/components/FurnitureCreator";

export const Route = createFileRoute("/create")({
  head: () => ({ meta: [{ title: "Custom Furniture AI — FormAI STUDIO" }, { name: "description", content: "Create original furniture with AI, references, materials and regional supplier preferences." }, { property: "og:title", content: "Custom Furniture AI" }, { property: "og:description", content: "Design custom furniture concepts with AI." }] }),
  component: FurnitureCreator,
});