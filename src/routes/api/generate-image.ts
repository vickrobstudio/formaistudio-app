import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RenderInput = z.object({
  prompt: z.string().trim().min(10),
  sourceImage: z.string().startsWith("data:image/").max(1_500_000_000).nullable().optional(),
  sourceImages: z.array(z.string().startsWith("data:image/").max(1_500_000_000)).max(5).optional(),
});

const MAX_TOTAL_IMAGE_INPUT = 6_000_000_000;

export const Route = createFileRoute("/api/generate-image")({
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

        const geminiKey = process.env.GEMINI_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;
        if (!geminiKey && !openaiKey) {
  return new Response("Rendering service is unavailable.", { status: 500 });
}

        const isTechnicalDrawing = /2D (floor plan|orthographic)|architectural drafting/i.test(
          result.data.prompt,
        );
        const editorialStandard = isTechnicalDrawing
          ? "Precise professional technical drawing, clean drafting hierarchy and proportional geometry."
          : "8K-target ultra-detailed photorealistic architectural rendering in the exact editorial style of Dezeen magazine (dezeen.com) — the dominant contemporary visual language of architecture and interior publishing. Emulate the rendering style, lighting and color treatment seen in Dezeen's featured projects: clean two-point perspective, calm symmetrical or quietly asymmetric compositions, generous negative space, honest framing and elite architectural photography discipline. Lighting is naturalistic and soft — diffused overcast daylight, gentle directional sun with long soft shadows, or restrained warm interior light around 2700–3000K against cool exterior light; physically accurate global illumination, soft contact shadows, subtle ambient occlusion and realistic light falloff. Color palette is muted, sophisticated and architectural: warm off-whites, natural plaster, raw concrete greys, oak / walnut / ash timber, travertine, brushed metals, linen and stone tones, with restrained accent colour — never oversaturated, never neon, never fantasy graded. White balance is neutral and true-to-life, slightly warm. Materials are physically accurate with real reflectance, roughness, grain, weave, veining and micro-imperfections; concrete shows form-work, wood shows grain, fabric shows weave, stone shows veining. Vegetation is species-correct, varied in hue, density and leaf age, never cloned. Render quality is magazine-cover sharp with refined editorial color grading, balanced HDR dynamic range, controlled highlights, open natural shadows, fine micro-detail, and a calm, premium, understated atmosphere consistent with a Dezeen featured project. Strictly photorealistic — no illustrative outlines, no CGI plastic look, no clipping, no halos, no haze, no over-sharpening, no artificial saturation, no neon tones, no fantasy grading, no weird colours.";
        const hasSource = Boolean(result.data.sourceImage);
        const fidelityLock = hasSource
          ? " ABSOLUTE PERSPECTIVE & LAYOUT FIDELITY (NON-NEGOTIABLE): the FIRST attached image is the binding spatial reference. Lock the camera position, focal length, framing, viewing angle, horizon line and every vanishing point to that image exactly. Reproduce every perspective line, wall edge, floor edge, ceiling edge, window opening, door opening, structural element and architectural line in the same direction, length, slope and convergence as the source — do not redraw, straighten, re-angle, re-scale or re-compose them. Preserve the exact shape, silhouette, proportions, footprint and orientation of every piece of furniture, fixture, accessory and object visible in the source, and keep each one in the SAME location, on the same wall and at the same depth as in the source. Do not add, remove, move, rotate, resize, swap or restyle any object. Only upgrade materials, lighting and finish quality to photoreal — geometry, layout and perspective stay 100% identical to the source." : "";
        const renderPrompt = `${result.data.prompt}. ${editorialStandard} Coherent perspective and construction-ready spatial logic, no text, no logos, no watermarks.${fidelityLock}`;
        let endpoint = "https://ai.gateway.lovable.dev/v1/images/generations";
        let body: BodyInit;
        let contentType: string | undefined = "application/json";

        const references = [result.data.sourceImage, ...(result.data.sourceImages ?? [])].filter(
          (image): image is string => Boolean(image),
        );
        if (references.length > 0) {
          // The Lovable AI gateway has no /v1/images/edits route. For
          // reference-image-conditioned renders, use Gemini's image model via
          // the chat-completions endpoint, which accepts image_url parts and
          // returns a generated image inline.
          for (const reference of references) {
            if (!/^data:image\/(?:png|jpeg|webp);base64,/.test(reference)) {
              return new Response("A reference image format is not supported.", {
                status: 400,
              });
            }
          }
          endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
          body = JSON.stringify({
            model: "gemini-3-pro-image-preview",
            modalities: ["image", "text"],
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: renderPrompt },
                  ...references.map((image) => ({
                    type: "image_url" as const,
                    image_url: { url: image },
                  })),
                ],
              },
            ],
          });
        } else {
          body = JSON.stringify({
            model: "openai/gpt-image-2",
            prompt: renderPrompt,
            quality: "medium",
            size: "1536x1024",
            stream: true,
            partial_images: 1,
          });
        }

        const headers: Record<string, string> = {
  Authorization: `Bearer ${geminiKey}`,
  Accept: "application/json",
};
        if (contentType) headers["Content-Type"] = contentType;
        const upstream = await fetch(endpoint, {
          method: "POST",
          headers,
          body,
        });

        if (!upstream.ok || !upstream.body) {
          const status = upstream.status === 402 ? 402 : upstream.status === 429 ? 429 : 502;
          const detail = await upstream.text().catch(() => "");
          console.error("generate-image upstream error", {
            status: upstream.status,
            endpoint,
            detail: detail.slice(0, 500),
          });
          const message =
            status === 402
              ? "AI credits are exhausted."
              : status === 429
                ? "The studio is busy. Please retry shortly."
                : `The rendering could not be created (upstream ${upstream.status}: ${detail.slice(0, 200) || "no detail"}).`;
          return new Response(message, { status });
        }

        // Chat-completions returns JSON, not SSE. Extract the generated image
        // and return it as { image } so the client's JSON branch can pick it up.
        if (endpoint.endsWith("/chat/completions")) {
          const payload = (await upstream.json().catch(() => null)) as
            | {
                choices?: Array<{
                  message?: {
                    images?: Array<{ image_url?: { url?: string } }>;
                    content?: string;
                  };
                }>;
              }
            | null;
          const image =
            payload?.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? null;
          if (!image) {
            console.error("generate-image gemini response missing image", payload);
            return new Response(
              "The rendering response did not include an image.",
              { status: 502 },
            );
          }
          return new Response(JSON.stringify({ image }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
