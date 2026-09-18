import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RenderInput = z.object({
  prompt: z.string().trim().min(10).max(28_000),
  sourceImage: z.string().startsWith("data:image/").max(4_000_000),
  sourceImages: z.array(z.string().startsWith("data:image/").max(4_000_000)).max(5).optional(),
});

const MAX_TOTAL_IMAGE_INPUT = 4_000_000;

export const Route = createFileRoute("/api/photo-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const result = RenderInput.safeParse(await request.json().catch(() => null));
        if (!result.success) {
          const issue = result.error.issues[0];
          const path = issue?.path.join(".") || "input";
          const detail = issue ? `${path}: ${issue.message}` : "Invalid input.";
          return new Response(`The rendering request was rejected (${detail}).`, { status: 400 });
        }

        const totalImageInput = [
          result.data.sourceImage,
          ...(result.data.sourceImages ?? []),
        ].reduce((sum, image) => sum + (image?.length ?? 0), 0);
        if (totalImageInput > MAX_TOTAL_IMAGE_INPUT) {
          return new Response(
            "The attached images are too large. Please use smaller or fewer references.",
            { status: 413 },
          );
        }

        const isTechnicalDrawing = /2D (floor plan|orthographic)|architectural drafting/i.test(
          result.data.prompt,
        );
        const editorialStandard = isTechnicalDrawing
          ? "Precise professional technical drawing, clean drafting hierarchy and proportional geometry."
          : "High-detail photorealistic architectural rendering in the exact editorial style of Dezeen magazine (dezeen.com) — the dominant contemporary visual language of architecture and interior publishing. Emulate the rendering style, lighting and color treatment seen in Dezeen's featured projects: clean two-point perspective, calm symmetrical or quietly asymmetric compositions, generous negative space, honest framing and elite architectural photography discipline. Lighting is naturalistic and soft — diffused overcast daylight, gentle directional sun with long soft shadows, or restrained warm interior light around 2700–3000K against cool exterior light; physically accurate global illumination, soft contact shadows, subtle ambient occlusion and realistic light falloff. Color palette is muted, sophisticated and architectural: warm off-whites, natural plaster, raw concrete greys, oak / walnut / ash timber, travertine, brushed metals, linen and stone tones, with restrained accent colour — never oversaturated, never neon, never fantasy graded. White balance is neutral and true-to-life, slightly warm. Materials are physically accurate with real reflectance, roughness, grain, weave, veining and micro-imperfections; concrete shows form-work, wood shows grain, fabric shows weave, stone shows veining. Vegetation is species-correct, varied in hue, density and leaf age, never cloned. Render quality is magazine-cover sharp with refined editorial color grading, balanced HDR dynamic range, controlled highlights, open natural shadows, fine micro-detail, and a calm, premium, understated atmosphere consistent with a Dezeen featured project. Strictly photorealistic — no illustrative outlines, no CGI plastic look, no clipping, no halos, no haze, no over-sharpening, no artificial saturation, no neon tones, no fantasy grading, no weird colours.";
        const hasSource = Boolean(result.data.sourceImage);
        const fidelityLock = hasSource
          ? " Preserve the source camera, perspective and architectural layout. Apply the changes explicitly requested by the user; keep all unrelated objects, geometry and materials unchanged. Use additional images as object or material references, not as replacement viewpoints."
          : "";
        const renderPrompt = `${result.data.prompt}. ${editorialStandard} Coherent perspective and construction-ready spatial logic, no text, no logos, no watermarks.${fidelityLock}`;
        const references = [result.data.sourceImage, ...(result.data.sourceImages ?? [])].filter(
          (image): image is string => Boolean(image),
        );
        const { renderOpenAIImage } = await import("@/lib/openai-image.server");
        return renderOpenAIImage(renderPrompt, references, request.signal);
      },
    },
  },
});

