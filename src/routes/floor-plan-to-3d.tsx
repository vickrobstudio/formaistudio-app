import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * SEO landing page targeting "floor plan to 3d" (Semrush: 170/mo, KDI 26 — easy).
 * Funnels the visitor to /2d-to-3d where the actual tool lives.
 */
export const Route = createFileRoute("/floor-plan-to-3d")({
  head: () => ({
    meta: [
      { title: "Floor Plan to 3D — Convert 2D Plans to 3D Models | FormAI" },
      { name: "description", content: "Turn any 2D floor plan into an editable 3D model with AI. Upload a PDF, JPG or PNG and download a Collada .dae model with true plan dimensions in seconds." },
      { property: "og:title", content: "Floor Plan to 3D — AI Converter" },
      { property: "og:description", content: "Turn any 2D floor plan into an editable 3D Collada .dae model with AI. Real dimensions, fast, no CAD skills required." },
      { property: "og:url", content: "https://formaistudio.app/floor-plan-to-3d" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://formaistudio.app/floor-plan-to-3d" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "FormAI Floor Plan to 3D",
        applicationCategory: "DesignApplication",
        operatingSystem: "Web",
        description: "AI-powered tool that converts 2D floor plans into editable 3D Collada .dae models with accurate dimensions.",
        url: "https://formaistudio.app/floor-plan-to-3d",
      }),
    }],
  }),
  component: FloorPlanTo3DLanding,
});

function FloorPlanTo3DLanding() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-background px-5 py-16">
      <article className="mx-auto max-w-3xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">AI Floor Plan Converter</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">Floor plan to 3D, in seconds</h1>
        <p className="mt-5 text-lg text-muted-foreground">
          Upload any 2D floor plan — PDF, JPG or PNG — and FormAI rebuilds it as a fully editable 3D model. Walls, openings and printed dimensions are read directly from the drawing, so the exported model matches your real-world measurements.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/2d-to-3d" className="inline-flex h-12 items-center rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:opacity-90">Convert my floor plan</Link>
          <Link to="/studio" className="inline-flex h-12 items-center rounded-full border border-border px-6 text-sm font-semibold text-foreground hover:bg-accent">Try the studio</Link>
        </div>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-foreground">How the AI floor plan to 3D converter works</h2>
          <ol className="mt-5 space-y-3 text-sm text-muted-foreground">
            <li><strong className="text-foreground">1 · Upload your plan</strong> — drag in a dimensioned PDF, JPG or PNG and pick your units (meters or feet & inches).</li>
            <li><strong className="text-foreground">2 · AI reads every dimension</strong> — walls, openings and printed measurements are parsed automatically.</li>
            <li><strong className="text-foreground">3 · Approve the photoreal render</strong> — see a 1:1 rendering before the mesh is built.</li>
            <li><strong className="text-foreground">4 · Live 3D preview</strong> — rotate, zoom and pan the reconstructed model in your browser.</li>
            <li><strong className="text-foreground">5 · Download a Collada .dae</strong> — opens directly in SketchUp, Blender, Rhino and AutoCAD.</li>
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-foreground">Why architects and designers use FormAI</h2>
          <ul className="mt-5 grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <li><strong className="text-foreground">True dimensions.</strong> The exported .dae uses the width, depth and height parsed from your plan — not a generic unit cube.</li>
            <li><strong className="text-foreground">Editable output.</strong> Grouped by material so SketchUp and Blender show separate layers you can re-skin.</li>
            <li><strong className="text-foreground">No CAD skills required.</strong> If you can upload a PDF, you can produce a 3D model.</li>
            <li><strong className="text-foreground">Furniture too.</strong> The same flow turns furniture drawings into reconstructed 3D meshes.</li>
          </ul>
        </section>

        <section className="mt-14 rounded-3xl border border-border p-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground">Convert your first floor plan free</h2>
          <p className="mt-3 text-sm text-muted-foreground">Upload a plan and download an editable .dae model in minutes.</p>
          <Link to="/2d-to-3d" className="mt-6 inline-flex h-12 items-center rounded-full bg-foreground px-6 text-sm font-semibold text-background hover:opacity-90">Open the converter</Link>
        </section>
      </article>
    </main>
  );
}