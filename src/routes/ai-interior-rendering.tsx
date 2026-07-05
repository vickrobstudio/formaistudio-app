import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * SEO landing page targeting "ai interior rendering" (Semrush: 20/mo, KDI 0 — easy win).
 */
export const Route = createFileRoute("/ai-interior-rendering")({
  head: () => ({
    meta: [
      { title: "AI Interior Rendering — Photoreal Interiors in Seconds | FormAI" },
      { name: "description", content: "AI interior rendering for designers and homeowners. Upload a room photo, sketch or floor plan and get an 8K photorealistic interior render — warm light, real materials, editorial quality." },
      { property: "og:title", content: "AI Interior Rendering — Photoreal Interiors Fast" },
      { property: "og:description", content: "Upload a room photo, sketch or floor plan and get an 8K photorealistic interior render in seconds." },
      { property: "og:url", content: "https://formaistudio.app/ai-interior-rendering" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://formaistudio.app/ai-interior-rendering" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "FormAI Interior Rendering",
        applicationCategory: "DesignApplication",
        operatingSystem: "Web",
        description: "AI interior rendering studio that turns room photos, sketches and floor plans into 8K photorealistic interior renderings.",
        url: "https://formaistudio.app/ai-interior-rendering",
      }),
    }],
  }),
  component: AiInteriorRenderingLanding,
});

function AiInteriorRenderingLanding() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-background px-5 py-16">
      <article className="mx-auto max-w-3xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">AI Interior Rendering</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">AI interior rendering, editorial quality</h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Upload a room photo, sketch or floor plan and FormAI generates an 8K photorealistic interior render — warm HDR light, accurate materials and the polished feel of a luxury architectural shoot.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/studio" className="inline-flex h-12 items-center rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:opacity-90">Render an interior</Link>
          <Link to="/photo-to-ai" className="inline-flex h-12 items-center rounded-full border border-border px-6 text-sm font-semibold text-foreground hover:bg-accent">Photo to AI</Link>
        </div>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-foreground">Perfect for every interior project</h2>
          <ul className="mt-5 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <li><strong className="text-foreground">Residential.</strong> Living rooms, kitchens, bedrooms, bathrooms — photoreal in seconds.</li>
            <li><strong className="text-foreground">Hospitality.</strong> Hotel suites, restaurants, lobbies and spas with editorial lighting.</li>
            <li><strong className="text-foreground">Retail &amp; commercial.</strong> Showrooms, offices and pop-ups visualized before build-out.</li>
            <li><strong className="text-foreground">Moodboards &amp; pitches.</strong> Generate multiple looks of the same room from one upload.</li>
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-foreground">How AI interior rendering works in FormAI</h2>
          <ol className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li><strong className="text-foreground">1 · Upload.</strong> A photo of the room, a sketch, or a 2D floor plan.</li>
            <li><strong className="text-foreground">2 · Describe the look.</strong> Style, mood, materials — in plain English.</li>
            <li><strong className="text-foreground">3 · Render.</strong> Get an 8K photoreal interior in under a minute.</li>
            <li><strong className="text-foreground">4 · Iterate.</strong> Re-render variations until it's perfect, then download.</li>
          </ol>
        </section>

        <section className="mt-14 rounded-3xl border border-border p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Render your first interior free</h2>
          <p className="mt-3 text-sm text-muted-foreground">No install, no GPU, no render farm. Just upload and go.</p>
          <Link to="/studio" className="mt-6 inline-flex h-12 items-center rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:opacity-90">Open the studio</Link>
        </section>
      </article>
    </main>
  );
}