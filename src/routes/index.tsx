import { createFileRoute, Link } from "@tanstack/react-router";
import { LandingBackgroundPaint } from "@/components/LandingBackgroundPaint";
import { LandingPaintLogo } from "@/components/LandingPaintLogo";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "FormAI STUDIO — For the architects of the world" },
    { name: "description", content: "The creative app for architects, interior and furniture designers — build 3D worlds and photorealistic renderings to showcase your ideas. For human and god creators." },
    { name: "theme-color", content: "#CECECE" },
    { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    { property: "og:title", content: "FormAI STUDIO — For the architects of the world" },
    { property: "og:description", content: "Build 3D worlds and photorealistic renderings. For architects, interior and furniture designers — and every creator." },
  ] }),
  component: HomePage,
});

function HomePage() {
  return <main className="landing-screen fixed inset-0 h-[100dvh] min-h-[100svh] w-screen overflow-hidden overscroll-none bg-background">
    <section className="relative flex h-full w-full items-center justify-center overflow-hidden bg-background">
      <LandingBackgroundPaint />
      <h1 className="sr-only">FormAI Studio</h1>
      <LandingPaintLogo />
      <p className="pointer-events-none absolute left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-20 -translate-x-1/2 text-center text-base font-medium leading-tight tracking-tight text-white sm:text-xl md:text-2xl [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
        AI Architects
        <br />
        Shaping the Form of the World
      </p>
      <Link
        to="/dashboard"
        className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-10 inline-flex min-h-11 min-w-36 -translate-x-1/2 items-center justify-center rounded-xl border border-white/30 bg-[oklch(0.85_0_0)] px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-none transition-colors hover:bg-[oklch(0.65_0_0)]"
      >
        Enter
      </Link>
      <nav aria-label="Legal" className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center whitespace-nowrap font-sans text-[9px] tracking-[0.04em] text-[oklch(0.65_0_0)] sm:text-[11px]">
        <Link to="/privacy" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-white">Privacy Policy</Link><span aria-hidden="true">|</span>
        <Link to="/terms" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-white">Terms of Use</Link><span aria-hidden="true">|</span>
        <Link to="/contact" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-white">Contact</Link>
      </nav>
    </section>
  </main>;
}