import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RenderInput = z.object({
  prompt: z.string().trim().min(10).max(3000),
  sourceImage: z.string().startsWith("data:image/").max(8_000_000).nullable().optional(),
  sourceImages: z.array(z.string().startsWith("data:image/").max(8_000_000)).max(5).optional(),
});

const MAX_TOTAL_IMAGE_INPUT = 4_500_000;

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const result = RenderInput.safeParse(await request.json().catch(() => null));
        if (!result.success) {
          return new Response("Describe the room in a little more detail.", {
            status: 400,
          });
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

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Rendering service is unavailable.", { status: 500 });

        const isTechnicalDrawing = /2D (floor plan|orthographic)|architectural drafting/i.test(
          result.data.prompt,
        );
        const editorialStandard = isTechnicalDrawing
          ? "Precise professional technical drawing, clean drafting hierarchy and proportional geometry."
          : "8K-target ultra-detailed luxury editorial architectural photography suitable for a leading worldwide interiors magazine. Shot with the disciplined composition, natural perspective, depth and restraint of an elite architectural photographer. Warm, realistic neutral color science with true-to-life white balance, controlled highlights, open natural shadows and balanced HDR dynamic range. Preserve physically accurate colors, textures, material grain, reflectance, roughness, scale and imperfections. Vegetation must show natural variation in species, hue, density, leaf age and form, never repeated or synthetic. Realistic illumination and contact shadows. No clipping, excessive exposure, crushed blacks, artificial saturation, color casts, neon tones, fantasy grading, haze, halos, plastic surfaces or weird colors.";
        const renderPrompt = `${result.data.prompt}. ${editorialStandard} Coherent perspective and construction-ready spatial logic, no text, no logos, no watermarks.`;
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
          endpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
          body = JSON.stringify({
            model: "google/gemini-2.5-flash-image",
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
          Authorization: `Bearer ${key}`,
          Accept: "text/event-stream",
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
