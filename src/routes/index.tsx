import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAILogo, FormaHeader } from "@/components/FormaMobile";
import heroMobile from "@/assets/rb-hero-mobile.png.asset.json";
import heroDesktop from "@/assets/rb-hero-desktop.png.asset.json";

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
  return <main className="min-h-screen bg-foreground text-primary-foreground">
    <FormaHeader transparent />
    <section className="relative min-h-screen overflow-hidden">
      <picture><source media="(min-width: 768px)" srcSet={heroDesktop.url} /><img src={heroMobile.url} alt="Sculptural contemporary furniture in a warm interior" className="absolute inset-0 h-full w-full object-cover" /></picture>
      <div className="absolute inset-0 bg-gradient-to-b from-foreground/55 via-foreground/10 to-foreground/80" />
      <div className="relative flex min-h-screen flex-col justify-end px-6 pb-14 pt-28 sm:px-10 md:max-w-2xl md:pb-20 md:pl-16">
        <FormAILogo inverse className="mb-5 h-11" />
        <h1 className="text-[clamp(2.8rem,12vw,5.5rem)] font-light leading-[0.92] tracking-[-0.045em]">AI-Based<br />Interior Studio</h1>
        <p className="mt-6 max-w-md text-sm font-light leading-6 text-primary-foreground/85">Experience the future of 3D visualization. Generate interior design proposals with AI and explore selected furniture in beautifully composed spaces.</p>
        <Button asChild variant="studio" size="lg" className="mt-8 h-12 w-full justify-between bg-background px-5 text-foreground hover:bg-background/90 sm:w-64"><Link to="/dashboard"><span>Enter Studio AI</span><ArrowRight /></Link></Button>
      </div>
    </section>
  </main>;
}