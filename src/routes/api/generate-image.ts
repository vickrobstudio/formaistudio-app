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

        if (!geminiKey) {
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
        // Use Gemini's native image API. The OpenAI compatibility endpoint
        // cannot serialize generated JPEG image parts.
        const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent";
        const references = [result.data.sourceImage, ...(result.data.sourceImages ?? [])].filter(
          (image): image is string => Boolean(image),
        );
        const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
          { text: renderPrompt },
        ];
        for (const reference of references) {
          const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(reference);
          if (!match) {
            return new Response("A reference image format is not supported.", { status: 400 });
          }
          parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
        }
        const body = JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        });
        const headers: Record<string, string> = {
          "x-goog-api-key": geminiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        };
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

        const payload = (await upstream.json().catch(() => null)) as {
          candidates?: Array<{
            finishReason?: string;
            content?: { parts?: Array<{
              thought?: boolean;
              inlineData?: { mimeType?: string; data?: string };
            }> };
          }>;
          promptFeedback?: { blockReason?: string };
        } | null;
        const imagePart = payload?.candidates?.[0]?.content?.parts?.find(
          (part) => !part.thought && part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data,
        );
        if (!imagePart?.inlineData?.data) {
          console.error("generate-image gemini response missing image", {
            finishReason: payload?.candidates?.[0]?.finishReason,
            blockReason: payload?.promptFeedback?.blockReason,
          });
          return new Response("The rendering response did not include an image.", { status: 502 });
        }
        const image = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
        return new Response(JSON.stringify({ image }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
