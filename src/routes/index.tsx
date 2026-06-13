import { createFileRoute, Link } from "@tanstack/react-router";
import { FormAILogo } from "@/components/FormaMobile";
import landingArtwork from "@/assets/formai-landing-original.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "FormAI STUDIO — AI Interior Design" },
    { name: "description", content: "Create interior design proposals with AI and explore selected furniture in photorealistic spaces." },
    { property: "og:title", content: "FormAI STUDIO — AI Interior Design" },
    { property: "og:description", content: "AI-powered interior visualization and furniture exploration." },
  ] }),
  component: HomePage,
});

function HomePage() {
  return <main className="min-h-[100svh] bg-background">
    <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))]">
      <img src={landingArtwork.url} alt="Watercolor collection of sculptural furniture and interior objects" className="absolute inset-0 h-full w-full object-cover object-center" />
      <Link to="/auth" aria-label="Sign in to FormAI Studio" className="relative z-10 flex min-h-11 items-center justify-center rounded-lg px-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
        <FormAILogo className="h-auto w-[min(78vw,23rem)]" />
      </Link>
    </section>
  </main>;
}