import { createFileRoute, Link } from "@tanstack/react-router";
import { FormAILogo } from "@/components/FormaMobile";
import landingArtwork from "@/assets/formai-landing-watercolor.png.asset.json";

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
    <section className="relative min-h-[100svh] overflow-hidden">
      <img src={landingArtwork.url} alt="Watercolor collection of sculptural furniture and interior objects" className="absolute inset-0 h-full w-full object-cover object-center" />
      <Link to="/dashboard" aria-label="Open FormAI Studio" className="absolute bottom-[max(1.15rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-10 flex min-h-11 items-end rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
        <FormAILogo className="w-20 sm:w-24" />
      </Link>
      <nav aria-label="Legal" className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center whitespace-nowrap text-[9px] tracking-[0.04em] text-foreground sm:text-[11px]">
        <Link to="/privacy" className="min-h-11 px-1.5 leading-[2.75rem]">Privacy Policy</Link><span aria-hidden="true">|</span>
        <Link to="/terms" className="min-h-11 px-1.5 leading-[2.75rem]">Terms of Use</Link><span aria-hidden="true">|</span>
        <Link to="/contact" className="min-h-11 px-1.5 leading-[2.75rem]">Contact</Link>
      </nav>
    </section>
  </main>;
}