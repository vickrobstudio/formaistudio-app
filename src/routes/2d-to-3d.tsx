import { createFileRoute } from "@tanstack/react-router";
import { FloorTo3D } from "@/components/FloorTo3D";

export const Route = createFileRoute("/2d-to-3d")({
  head: () => ({ meta: [
    { title: "2D to 3D — FormAI STUDIO" },
    { name: "description", content: "Upload an architectural floor plan as PDF, JPG or PNG and download an editable 3D Collada .dae model." },
    { property: "og:title", content: "2D to 3D" },
    { property: "og:description", content: "Lift floor plans into editable 3D Collada .dae models with AI." },
  ] }),
  component: FloorTo3D,
});