import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  fileDataUrl: z
    .string()
    .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
    .max(2_700_000_000),
  subject: z.enum(["building", "furniture"]).default("furniture"),
  referenceImages: z
    .array(z.string().regex(/^data:image\/(?:png|jpeg|webp);base64,/).max(8_000_000))
    .max(6)
    .optional(),
});

type Result = { ok: true; prompt: string } | { ok: false; error: string };

const SYSTEM = `You read a technical drawing of a single furniture piece or a single architectural building and return ONE rich descriptive paragraph that an image-generation model can use to render a photoreal hero image of the finished object.

The paragraph must include:
- The object type and overall silhouette/shape (e.g. "oval bar-height pedestal table", "L-shaped sectional sofa").
- EVERY distinct part with its real-world dimension and material — read printed callouts, dimensions and material codes (e.g. "ST-05 Calacatta stone top 2'-10\" × 1'-8\" with full bullnose oak edge profile WD-09, 3\" Ø solid white oak tapered pedestal column 2'-4\" tall, brass MT-02 footrest ring, 1'-0\" diameter solid oak base disc, total height 3'-6\"").
- Materials and finishes called out in the drawing or visible in reference photos (stone type, wood species, metal finish, leather/fabric, glass).
- Lighting and camera: soft studio lighting, three-quarter view, neutral seamless background, 50mm lens, eye-level for furniture / interior architectural shot for buildings.
- The look: photoreal, 8K, luxury editorial product photography, realistic warm white balance, accurate material reflectance, natural contact shadows, no text, no logos, no watermarks.

CRITICAL — SHAPE FIDELITY:
If reference images (photographs, renderings or inspiration shots) are attached AFTER the technical drawing, treat them together as the single source of truth for the final SHAPE, SILHOUETTE and PROPORTIONS of the piece. The technical drawing supplies dimensions, callouts and construction; the reference images supply the exact outline, curvature, edge profile, joinery and styling cues. Your description MUST match BOTH — the printed dimensions from the drawing AND the visible shape from the references. Do not default to a generic rectangular / cylindrical version when the references show a curved, scalloped, organic or otherwise non-standard outline.

CRITICAL — UNIQUE SHAPE TRAITS:
You MUST start the paragraph with any feature that makes this piece different from a generic version of itself — and write that feature in ALL CAPS so the renderer processes it first and never forgets it.
Examples of features that MUST appear in UPPER CASE: SCALLOPED BORDER, FLUTED BASE, REEDED FRONT, CHANNEL-TUFTED BACK, CURVED / KIDNEY / BOOMERANG PLAN, CANTILEVERED TOP, TAMBOUR DOORS, ARCHED HEADBOARD, BULLNOSE EDGE, OGEE EDGE, WATERFALL EDGE, LIVE EDGE, PIE-CRUST EDGE, SPLAYED LEGS, TURNED LEGS, CABRIOLE LEGS, TRESTLE BASE, PEDESTAL BASE, X-BASE, HAIRPIN LEGS, SCULPTED / ORGANIC / BIOMORPHIC FORM, ASYMMETRIC SILHOUETTE, INLAID MARQUETRY, CARVED RELIEF, EXPOSED JOINERY, HAND-HAMMERED FINISH, ANY OTHER NON-STANDARD DETAIL VISIBLE IN PLAN, ELEVATION, OR REFERENCE PHOTO.
If multiple unique traits exist, list ALL of them in UPPER CASE at the very beginning of the paragraph as a comma-separated lead-in (e.g. "SCALLOPED BORDER, FLUTED PEDESTAL, BRASS INLAY RING — then continue with the full description..."). Then continue with the normal description.
Never simplify or omit a unique trait. If the drawing shows it, it MUST be in the prompt, in UPPER CASE, at the front.

Return ONLY the paragraph as plain text — no JSON, no Markdown, no headings, no bullet points.`;

export const buildMasterPrompt = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<Result> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, error: "The rendering service is unavailable." };

    const isPdf = data.fileDataUrl.startsWith("data:application/pdf");
    const userContent: Array<Record<string, unknown>> = [{ type: "text", text: SYSTEM }];
    if (isPdf) {
      userContent.push({ type: "file", file: { filename: "source.pdf", file_data: data.fileDataUrl } });
    } else {
      userContent.push({ type: "image_url", image_url: { url: data.fileDataUrl } });
    }
    const refs = data.referenceImages ?? [];
    if (refs.length > 0) {
      userContent.push({
        type: "text",
        text: `The following ${refs.length} image${refs.length === 1 ? " is a" : "s are"} REFERENCE PHOTO${refs.length === 1 ? "" : "S"} of the desired shape, silhouette and styling for this piece. Match their outline, curvature and proportions in your description — alongside the dimensions from the technical drawing above.`,
      });
      for (const ref of refs) {
        userContent.push({ type: "image_url", image_url: { url: ref } });
      }
    }

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
},
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("master-prompt failed", upstream.status, detail.slice(0, 400));
      if (upstream.status === 402) return { ok: false, error: "AI credits are exhausted." };
      if (upstream.status === 429) return { ok: false, error: "The studio is busy. Please retry shortly." };
      return { ok: false, error: "The master prompt could not be created." };
    }

    const payload = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const prompt = payload.choices?.[0]?.message?.content?.trim();
    if (!prompt) return { ok: false, error: "The AI did not return a prompt." };
    return { ok: true, prompt };
  });
