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

        const key = process.env.GEMINI_API_KEY;
        if (!key) return new Response("Rendering service is unavailable.", { status: 500 });

        const isTechnicalDrawing = /2D (floor plan|orthographic)|architectural drafting/i.test(
          result.data.prompt,
        );
        const editorialStandard = isTechnicalDrawing
          ? "Precise professional technical drawing, clean drafting hierarchy and proportional geometry."
          : "8K-quality ultra-detailed photorealistic architectural rendering with the cinematic, atmospheric sensibility of elite contemporary architectural visualization (in the spirit of studio-quality visualizers such as Filippo Bolognese) — evocative, moody and emotionally resonant, never sterile or clinical. TWO-POINT PERSPECTIVE IS MANDATORY: compose the shot with exactly two vanishing points on a level horizon and perfectly vertical verticals — no third vanishing point, no tilt, no keystone, no dutch angle; the camera is an architectural full-frame tilt-shift 24–35mm lens. Composition is calm and deliberate — quietly asymmetric or balanced, generous negative space, a clear focal path, honest framing and elite architectural-photography discipline. LIGHTING is cinematic yet physically believable: dramatic naturalistic daylight with real direction and long soft shadows, moody overcast or golden low-sun atmosphere, gentle volumetric light and tasteful atmospheric depth (subtle haze only where it adds mood, never muddy); layered warm interior light around 2700–3000K reading against cooler exterior light; physically accurate global illumination, soft contact shadows, ambient occlusion and true light falloff. COLOUR is a refined cinematic grade — muted, sophisticated, earthy and architectural: warm off-whites, natural plaster, raw concrete greys, oak / walnut / ash timber, travertine, brushed metals, linen, stone and desaturated deep greens, with restrained, intentional accent colour; slightly warm true-to-life white balance; filmic tonal roll-off with controlled highlights and open, luminous shadows — never oversaturated, never neon, never fantasy graded. MATERIALS are physically accurate with real reflectance, roughness, grain, weave, veining and micro-imperfections; concrete shows form-work, wood shows grain, fabric shows weave, stone shows veining. Vegetation is species-correct and varied, never cloned. FINISH: overlay a fine, even analogue photographic film grain across the whole image so it reads as a real photograph shot on fine-grained 35mm film — subtle, luminance-based, cohesive, never digital noise, never blotchy. Magazine-cover sharp with refined editorial colour grading and balanced HDR dynamic range. Strictly photorealistic — no illustrative outlines, no CGI plastic look, no clipping, no halos, no over-sharpening, no artificial saturation, no neon tones, no fantasy grading, no weird colours.";
        const hasSource = Boolean(result.data.sourceImage);
        // When a source image is present, fidelity is the default: the render
        // must match the reference's camera, geometry, materials and finishes
        // 100%, and change ONLY what the tool's own instructions above have
        // explicitly requested (e.g. the Studio design brief, or the 3D-to-AI
        // "invent photoreal surroundings" clause). Everything else stays exactly
        // as in the source. A safe photographic finish (real light + 4K sharp +
        // fine 35mm film grain) is added without altering geometry or materials.
        const fidelityLock =
          " ABSOLUTE SOURCE FIDELITY — DO NOT INVENT: the FIRST attached image is the binding reference. Reproduce its camera position, focal length, framing, viewing angle, horizon line and every vanishing point EXACTLY — do not straighten, re-angle, re-scale or re-compose. Reproduce every wall, floor and ceiling edge, opening and structural element, and the exact shape, proportions, position and orientation of every surface and object, EXACTLY as in the source. PRESERVE THE ACTUAL MATERIALS, COLOURS AND FINISHES of every surface exactly as shown — same wood species, stone, metal, paint colour and fabric — only resolving them to true photographic detail. Change ONLY what the instructions above explicitly asked to change; INVENT, add, remove, move, recolour or restyle NOTHING else. Render at true 4K photographic quality and overlay a fine, even analogue 35mm film grain so the result reads as a real camera photograph.";
        // Long-exposure people: a signature of high-end architectural /
        // interiors magazine photography — the architecture stays razor sharp
        // while any human figures are softly motion-blurred, as in a long
        // exposure, emphasising the stillness of the space. Only styles people
        // IF they appear; never forces adding them, and never blurs anything
        // that is not a person.
        const peopleMotion =
          " If any people or human figures appear, render them with gentle directional MOTION BLUR — soft, semi-transparent, ghosted as in a long-exposure architectural photograph — while keeping ALL architecture, furniture and objects perfectly sharp and static. This is the professional architectural / interior-design photographer look; do not motion-blur anything except the moving people.";
        const renderPrompt = hasSource
          ? `${result.data.prompt}.${fidelityLock}${peopleMotion} No text, no logos, no watermarks.`
          : `${result.data.prompt}. ${editorialStandard}${peopleMotion} Coherent perspective and construction-ready spatial logic, no text, no logos, no watermarks.`;
        // Google Gemini direct — NATIVE generateContent endpoint, which is
        // the only surface exposing the image-quality controls. Renders are
        // produced at maximum quality: 4K output, 3:2 editorial landscape.
        const endpoint =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent";

        const references = [result.data.sourceImage, ...(result.data.sourceImages ?? [])].filter(
          (image): image is string => Boolean(image),
        );
        const referenceParts: Array<{ inline_data: { mime_type: string; data: string } }> = [];
        for (const reference of references) {
          const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(reference);
          if (!match) {
            return new Response("A reference image format is not supported.", {
              status: 400,
            });
          }
          referenceParts.push({
            inline_data: { mime_type: match[1], data: match[2].replace(/\s+/g, "") },
          });
        }
        const body = JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: renderPrompt }, ...referenceParts],
            },
          ],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              imageSize: "4K",
              aspectRatio: "3:2",
            },
          },
        });

        const upstream = await fetch(endpoint, {
          method: "POST",
          headers: {
            "x-goog-api-key": key,
            "Content-Type": "application/json",
          },
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

        // Extract the generated image from the native response shape and
        // return it as { image } so the client's JSON branch picks it up.
        const payload = (await upstream.json().catch(() => null)) as
          | {
              candidates?: Array<{
                content?: {
                  parts?: Array<{
                    inlineData?: { mimeType?: string; data?: string };
                    inline_data?: { mime_type?: string; data?: string };
                    text?: string;
                  }>;
                };
              }>;
            }
          | null;
        let image: string | null = null;
        for (const part of payload?.candidates?.[0]?.content?.parts ?? []) {
          const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type;
          const data = part.inlineData?.data ?? part.inline_data?.data;
          if (mime?.startsWith("image/") && data) {
            image = `data:${mime};base64,${data}`;
            break;
          }
        }
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
      },
    },
  },
});
