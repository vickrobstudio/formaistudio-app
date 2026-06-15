import { createFileRoute, Link } from "@tanstack/react-router";
import { FormAILogo } from "@/components/FormaMobile";
import { Button } from "@/components/ui/button";
import landingArtwork from "@/assets/formai-landing-sharp.png.asset.json";
import desktopWallpaper from "@/assets/formai-desktop-wallpaper.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "FormAI STUDIO — AI Interior Design" },
    { name: "description", content: "Create interior design proposals with AI and explore selected furniture in photorealistic spaces." },
    { name: "theme-color", content: "#fbf5e7" },
    { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    { property: "og:title", content: "FormAI STUDIO — AI Interior Design" },
    { property: "og:description", content: "AI-powered interior visualization and furniture exploration." },
  ], links: [{ rel: "preload", as: "image", href: landingArtwork.url, fetchPriority: "high" }, { rel: "preload", as: "image", href: desktopWallpaper.url, fetchPriority: "high" }] }),
  component: HomePage,
});

function HomePage() {
  return <main className="landing-screen fixed inset-0 h-[100dvh] min-h-[100svh] w-screen touch-none overflow-hidden overscroll-none bg-landing-paper">
    <section className="relative h-full w-full overflow-hidden bg-landing-paper">
      <img src={landingArtwork.url} alt="Watercolor collection of sculptural furniture and interior objects" width="853" height="1844" fetchPriority="high" className="absolute inset-0 block size-full min-h-full min-w-full object-cover object-center md:hidden" />
      <img src={desktopWallpaper.url} alt="Watercolor FORM lettering composed of furniture pieces" width="1660" height="920" fetchPriority="high" className="absolute inset-0 hidden size-full min-h-full min-w-full object-cover object-center md:block" />
      <Link to="/dashboard" aria-label="Open FormAI Studio" className="absolute left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-10 flex min-h-11 -translate-x-1/2 items-center justify-center rounded-lg px-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
        <FormAILogo className="w-16 sm:w-20" />
      </Link>
      <h1 className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold tracking-tight text-primary-foreground sm:text-5xl">AI Studio</h1>
      <Button asChild variant="studio" className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-10 min-w-36 -translate-x-1/2 border border-landing-button bg-landing-button text-landing-paper hover:bg-landing-button/85">
        <Link to="/dashboard">Enter</Link>
      </Button>
      <nav aria-label="Legal" className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center whitespace-nowrap font-sans text-[9px] tracking-[0.04em] text-primary-foreground sm:text-[11px]">
        <Link to="/privacy" className="min-h-11 px-1.5 leading-[2.75rem]">Privacy Policy</Link><span aria-hidden="true">|</span>
        <Link to="/terms" className="min-h-11 px-1.5 leading-[2.75rem]">Terms of Use</Link><span aria-hidden="true">|</span>
        <Link to="/contact" className="min-h-11 px-1.5 leading-[2.75rem]">Contact</Link>
      </nav>
    </section>
  </main>;
}