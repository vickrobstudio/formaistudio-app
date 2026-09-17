import { createFileRoute } from "@tanstack/react-router";
import { ToolsHub } from "@/components/ToolsHub";

export const Route = createFileRoute("/tools")({
  head: () => ({ meta: [{ title: "AI Tools — FormAI Studio" }, { name: "description", content: "Access FormAI Studio's five creative AI tools." }, { property: "og:title", content: "FormAI Studio AI Tools" }, { property: "og:description", content: "Create spaces, render perspectives, edit photos and generate video tours." }] }),
  component: ToolsHub,
});
