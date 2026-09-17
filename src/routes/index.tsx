import { createFileRoute, Link } from "@tanstack/react-router";
import { LandingBackgroundPaint } from "@/components/LandingBackgroundPaint";
import { LandingPaintLogo } from "@/components/LandingPaintLogo";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "FormAI Studio — 2D Floor Plans to 3D & AI Rendering" },
    { name: "description", content: "The creative app for architects, interior and furniture designers — build 3D worlds and photorealistic renderings to showcase your ideas. For human and god creators." },
    { name: "theme-color", content: "#ffffff" },
    { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    { property: "og:title", content: "FormAI Studio — 2D Floor Plans to 3D & AI Rendering" },
    { property: "og:description", content: "Build 3D worlds and photorealistic renderings. For architects, interior and furniture designers — and every creator." },
  ] }),
  component: HomePage,
});

function HomePage() {
  return <main className="landing-screen min-h-screen w-full bg-white">
    <section className="relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-white">
      <LandingBackgroundPaint enabled={true} />
      <h1 className="sr-only">FormAI Studio — 2D floor plans to 3D and AI rendering</h1>
      <LandingPaintLogo />
      <p className="pointer-events-none absolute left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-20 -translate-x-1/2 text-center text-base font-medium leading-tight tracking-tight text-[oklch(0.25_0_0)] sm:text-xl md:text-2xl [text-shadow:0_1px_2px_rgba(255,255,255,0.5)]">
        AI Architects
        <br />
        Shaping the Form of the World
      </p>
      <Link
        to="/floor-plan-to-3d"
        className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-10 inline-flex min-h-11 min-w-36 -translate-x-1/2 items-center justify-center rounded-xl border border-white/30 bg-landing-button px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-none transition-colors hover:bg-black"
      >
        Explore FormAI
      </Link>
      <nav aria-label="Legal" className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center whitespace-nowrap font-sans text-[9px] tracking-[0.04em] text-[oklch(0.45_0_0)] sm:text-[11px]">
        <Link to="/privacy" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Privacy Policy</Link><span aria-hidden="true">|</span>
        <Link to="/terms" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Terms of Use</Link><span aria-hidden="true">|</span>
        <Link to="/contact" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Contact</Link>
      </nav>
    </section>
    <section className="mx-auto max-w-5xl px-6 py-20 text-neutral-900"><p className="text-xs uppercase tracking-widest">AI-assisted design for architects and interiors</p><h2 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight">Explore your floor plan in 3D. Refine your vision with AI.</h2><p className="mt-6 max-w-2xl text-lg text-neutral-600">Bring a drawing or room photo and work through a visual design process. Review your results, refine the details and choose the tools that fit your practice.</p><div className="mt-9 flex flex-wrap gap-4"><Link to="/floor-plan-to-3d" className="rounded-full bg-black px-6 py-4 font-semibold text-white">Explore 2D to 3D</Link><Link to="/photo-to-ai" className="rounded-full border border-neutral-300 px-6 py-4">Edit a room photo</Link><Link to="/pricing" className="rounded-full border border-neutral-300 px-6 py-4">Compare subscriptions</Link></div><p className="mt-8 text-sm text-neutral-500">AI-assisted tools in beta. Inspect geometry, dimensions and image details before professional use.</p></section>
  </main>;
}