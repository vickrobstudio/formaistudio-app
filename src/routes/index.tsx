import { createFileRoute, Link } from "@tanstack/react-router";
import { LandingBackgroundPaint } from "@/components/LandingBackgroundPaint";
import { LandingPaintLogo } from "@/components/LandingPaintLogo";
import { LandingArchitectGuide } from "@/components/LandingArchitectGuide";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "AI Interior Design App | FormAI Studio" },
    { name: "description", content: "Explore AI furniture concepts, turn an AI plan into an AI 3D model, and visualize your space with FormAI Studio. Start your next design." },
    { name: "theme-color", content: "#3a3a3a" },
    { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    { property: "og:title", content: "AI Interior Design App | FormAI Studio" },
    { property: "og:description", content: "Explore AI furniture concepts, turn an AI plan into an AI 3D model, and visualize your space with FormAI Studio. Start your next design." },
  ],
  links: [
    { rel: "canonical", href: "https://www.formaistudio.app/" },
    { rel: "preload", as: "image", href: "/backgrounds/eden-mobile.jpg", media: "(max-width: 639px)" },
    { rel: "preload", as: "image", href: "/backgrounds/eden-ipad.jpg", media: "(min-width: 640px) and (max-width: 1023px)" },
    { rel: "preload", as: "image", href: "/backgrounds/eden-desktop.jpg", media: "(min-width: 1024px)" },
  ] }),
  component: HomePage,
});

function HomePage() {
  return <main className="landing-screen min-h-screen w-full bg-white">
    <section className="relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-white">
      <LandingBackgroundPaint enabled={true} />
      <LandingPaintLogo />
      <p className="pointer-events-none absolute left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-20 -translate-x-1/2 text-center text-base font-medium leading-tight tracking-tight text-[oklch(0.25_0_0)] sm:text-xl md:text-2xl [text-shadow:0_1px_2px_rgba(255,255,255,0.5)]">
        AI Architects
        <br />
        Shaping the Form of the World
      </p>
      <Link
        to="/feed"
        className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-10 inline-flex min-h-11 min-w-36 -translate-x-1/2 items-center justify-center rounded-xl border border-white/30 bg-landing-button px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-none transition-colors hover:bg-black"
      >
        Explore FormAI Studio
      </Link>
      <nav aria-label="Legal" className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center whitespace-nowrap font-sans text-[9px] tracking-[0.04em] text-[oklch(0.45_0_0)] sm:text-[11px]">
        <Link to="/privacy" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Privacy Policy</Link><span aria-hidden="true">|</span>
        <Link to="/terms" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Terms of Use</Link><span aria-hidden="true">|</span>
        <Link to="/contact" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Contact</Link>
      </nav>
    </section>

    <section className="mx-auto max-w-4xl px-6 py-10 text-neutral-900" aria-label="Discover FormAI Studio">
      <h1 className="text-2xl font-semibold sm:text-3xl">AI Interior Design App That Brings Your Space to Life</h1>
      <details className="mt-5 rounded-2xl border border-neutral-200 p-5">
        <summary className="min-h-11 cursor-pointer font-medium">Meet your AI design workspace</summary>
        <p className="mt-4 leading-7">See what your space could become before making a change. FormAI Studio is an AI interior design app that transforms photos, floor plans and ideas into realistic design visuals. Explore AI furniture concepts, refine materials and lighting, and turn supported floor plans into an interactive AI 3D model. Bring your next interior design idea into focus—all in one creative workspace.</p>
        <div className="mt-6 space-y-6">
          <div><h2 className="text-xl">AI Furniture: Explore Pieces That Fit Your Vision</h2><h3 className="mt-2 text-base">AI Design for Materials, Colors and Finishes</h3><Link to="/studio" className="inline-flex min-h-11 items-center underline">Explore Studio AI</Link></div>
          <div><h2 className="text-xl">AI Plan: Turn Your Floor Plan Into a Clearer Vision</h2><h3 className="mt-2 text-base">AI Architecture Tools for Scale and Spatial Exploration</h3><Link to="/floor-plan-to-3d" className="inline-flex min-h-11 items-center underline">Explore floor plans to 3D</Link></div>
          <div><h2 className="text-xl">AI 3D Model: Rotate, Review and Explore Your Design</h2><Link to="/tools" className="inline-flex min-h-11 items-center underline">Browse tools</Link></div>
        </div>
        <ul className="mt-6 list-disc space-y-3 pl-5">
          <li><strong>AI FURNITURE:</strong> Explore furniture concepts, materials and finishes for your space.</li>
          <li><strong>AI PLAN:</strong> Upload your floor plan and calibrate its scale using a known measurement.</li>
          <li><strong>AI 3D MODEL:</strong> Rotate, inspect and explore your model in AR on supported devices.</li>
          <li><strong>AI INTERIOR DESIGN:</strong> Create realistic room visuals and refine lighting, colors and materials.</li>
        </ul>
      </details>
    </section>
    <LandingArchitectGuide />
  </main>;
}

