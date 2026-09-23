import { useState } from "react";
import { WelcomeTutorial } from "@/components/WelcomeTutorial";
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
  const [tutorialOpen, setTutorialOpen] = useState(false);
  return <main className="landing-screen min-h-screen w-full bg-white">
    <section className="relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-white">
      <LandingBackgroundPaint enabled={true} />
      <LandingPaintLogo />
      <p className="pointer-events-none absolute left-1/2 top-[max(5rem,calc(env(safe-area-inset-top)+4rem))] z-20 -translate-x-1/2 text-center text-base font-medium leading-tight tracking-tight text-[oklch(0.25_0_0)] sm:text-xl md:text-2xl [text-shadow:0_1px_2px_rgba(255,255,255,0.5)]">
        AI Architects
        <br />
        Shaping the Form of the World
      </p>
      <button
        type="button"
        onClick={() => setTutorialOpen(true)}
        className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-10 inline-flex min-h-11 min-w-36 -translate-x-1/2 items-center justify-center rounded-xl border border-white/30 bg-landing-button px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white shadow-none transition-colors hover:bg-black"
      >
        Explore FormAI Studio
      </button>
      <nav aria-label="Legal" className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center whitespace-nowrap font-sans text-[9px] tracking-[0.04em] text-[oklch(0.45_0_0)] sm:text-[11px]">
        <Link to="/privacy" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Privacy Policy</Link><span aria-hidden="true">|</span>
        <Link to="/terms" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Terms of Use</Link><span aria-hidden="true">|</span>
        <Link to="/contact" className="min-h-11 px-1.5 leading-[2.75rem] transition-colors hover:text-black">Contact</Link>
      </nav>
    </section>

    {tutorialOpen && <WelcomeTutorial open={tutorialOpen} onOpenChange={setTutorialOpen} />}
    <LandingArchitectGuide />
  </main>;
}
