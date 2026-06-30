import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LandingPaintLogo } from "@/components/LandingPaintLogo";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "FormAI STUDIO — For the architects of the world" },
    { name: "description", content: "The creative app for architects, interior and furniture designers — build 3D worlds and photorealistic renderings to showcase your ideas. For human and god creators." },
    { name: "theme-color", content: "#ffffff" },
    { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    { property: "og:title", content: "FormAI STUDIO — For the architects of the world" },
    { property: "og:description", content: "Build 3D worlds and photorealistic renderings. For architects, interior and furniture designers — and every creator." },
  ] }),
  component: HomePage,
});

function HomePage() {
  return <main className="landing-screen fixed inset-0 h-[100dvh] min-h-[100svh] w-screen overflow-hidden overscroll-none bg-white">
    <section className="relative flex h-full w-full items-center justify-center overflow-hidden bg-white">
      <h1 className="sr-only">FormAI Studio</h1>
      <LandingPaintLogo />
      <p className="pointer-events-none absolute left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-20 -translate-x-1/2 whitespace-nowrap text-center text-base font-medium tracking-tight text-neutral-500 sm:text-xl md:text-2xl">
        AI Architects Shaping the Form of the World
      </p>
      <Button asChild variant="studio" className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-10 min-w-36 -translate-x-1/2 border border-black bg-black text-white hover:bg-black/85">
        <Link to="/dashboard">Enter</Link>
      </Button>
      <nav aria-label="Legal" className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center whitespace-nowrap font-sans text-[9px] tracking-[0.04em] text-black/70 sm:text-[11px]">
        <Link to="/privacy" className="min-h-11 px-1.5 leading-[2.75rem]">Privacy Policy</Link><span aria-hidden="true">|</span>
        <Link to="/terms" className="min-h-11 px-1.5 leading-[2.75rem]">Terms of Use</Link><span aria-hidden="true">|</span>
        <Link to="/contact" className="min-h-11 px-1.5 leading-[2.75rem]">Contact</Link>
      </nav>
    </section>
  </main>;
}