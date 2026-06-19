import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * SEO landing page targeting "ai rendering" (Semrush: 1,000/mo, KDI 48 — possible).
 */
export const Route = createFileRoute("/ai-rendering")({
  head: () => ({
    meta: [
      { title: "AI Rendering — Photorealistic Renders in Seconds | FormAI" },
      { name: "description", content: "AI rendering for architects, interior designers and product makers. Turn sketches, photos and floor plans into 8K photoreal renderings — no GPU, no render farm, no waiting." },
      { property: "og:title", content: "AI Rendering — Photorealistic Renders in Seconds" },
      { property: "og:description", content: "Turn sketches, photos and floor plans into 8K photoreal renderings with AI. No GPU, no render farm, no waiting." },
      { property: "og:url", content: "https://formaistudio.app/ai-rendering" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://formaistudio.app/ai-rendering" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "FormAI Rendering",
        applicationCategory: "DesignApplication",
        operatingSystem: "Web",
        description: "AI rendering studio that produces 8K photorealistic interior, exterior and product renders from sketches, photos and 2D plans.",
        url: "https://formaistudio.app/ai-rendering",
      }),
    }],
  }),
  component: AiRenderingLanding,
});

function AiRenderingLanding() {
  return (
    <main className="min-h-screen bg-background px-5 py-16">
      <article className="mx-auto max-w-3xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">AI Rendering Studio</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">AI rendering, in editorial 8K quality</h1>
        <p className="mt-5 text-lg text-muted-foreground">
          FormAI is an AI rendering studio for architects, interior designers and product makers. Upload a sketch, a photo or a 2D plan and get a photoreal 8K rendering in under a minute — no GPU, no render farm, no waiting.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/studio" className="inline-flex h-12 items-center rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:opacity-90">Open the AI studio</Link>
          <Link to="/ai-edits" className="inline-flex h-12 items-center rounded-full border border-border px-6 text-sm font-semibold text-foreground hover:bg-accent">Edit a rendering</Link>
        </div>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-foreground">What you can render with FormAI</h2>
          <ul className="mt-5 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <li><strong className="text-foreground">Interior renderings.</strong> Living rooms, kitchens, bedrooms, hotels — warm HDR lighting, realistic materials.</li>
            <li><strong className="text-foreground">Exterior &amp; architecture.</strong> Facades, landscapes and site visuals from rough massing or photos.</li>
            <li><strong className="text-foreground">Furniture &amp; product.</strong> Reference photos in, editorial 8K renders out.</li>
            <li><strong className="text-foreground">Plan-to-render.</strong> Upload a 2D plan and get a photoreal render of the finished space.</li>
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-foreground">Why FormAI beats traditional rendering</h2>
          <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li><strong className="text-foreground">Seconds, not hours.</strong> Skip the V-Ray queue.</li>
            <li><strong className="text-foreground">Editorial color &amp; materials.</strong> Tuned for luxury architectural photography, not generic AI gloss.</li>
            <li><strong className="text-foreground">Iterate in plain English.</strong> Re-render with a prompt change — "warmer light", "marble floor", "evening".</li>
            <li><strong className="text-foreground">Full pipeline.</strong> Render, edit, animate to video, export to 3D — all in one app.</li>
          </ul>
        </section>

        <section className="mt-14 rounded-3xl border border-border p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Try AI rendering free</h2>
          <p className="mt-3 text-sm text-muted-foreground">Your first render takes about a minute. No download, no install.</p>
          <Link to="/studio" className="mt-6 inline-flex h-12 items-center rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:opacity-90">Start rendering</Link>
        </section>
      </article>
    </main>
  );
}