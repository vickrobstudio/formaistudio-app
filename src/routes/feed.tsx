import { createFileRoute } from "@tanstack/react-router";
import { CommunityFeed } from "@/components/CommunityFeed";

export const Route = createFileRoute("/feed")({
  head: () => ({ meta: [
    { title: "Community Feed — FormAI STUDIO" },
    { name: "description", content: "Discover public furniture, interiors and renderings created by the FormAI STUDIO community." },
    { property: "og:title", content: "FormAI STUDIO Community" },
    { property: "og:description", content: "Explore and save inspiring AI creations from the FormAI community." },
  ] }),
  component: CommunityFeed,
});