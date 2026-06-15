import { createFileRoute } from "@tanstack/react-router";
import { ToolsHub } from "@/components/ToolsHub";

export const Route = createFileRoute("/tools")({
  head: () => ({ meta: [{ title: "AI Tools — FormAI STUDIO" }, { name: "description", content: "Access FormAI STUDIO's five creative AI tools." }, { property: "og:title", content: "FormAI STUDIO AI Tools" }, { property: "og:description", content: "Create spaces, render perspectives, edit photos and generate video tours." }] }),
  component: ToolsHub,
});