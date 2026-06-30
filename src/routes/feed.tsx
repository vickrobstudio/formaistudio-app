import { createFileRoute } from "@tanstack/react-router";
import { CommunityFeed } from "@/components/CommunityFeed";

export const Route = createFileRoute("/feed")({
  head: () => ({ meta: [
    { title: "Community — Architects of the world · FormAI STUDIO" },
    { name: "description", content: "Explore 3D worlds, photorealistic renderings, interiors and furniture shared by architects, designers and creators in the FormAI STUDIO community." },
    { property: "og:title", content: "FormAI STUDIO Community — Architects of the world" },
    { property: "og:description", content: "3D worlds, photorealistic renderings and original furniture from architects, interior and furniture designers around the world." },
  ] }),
  component: CommunityFeed,
});