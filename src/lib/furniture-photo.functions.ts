import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const photoRegion = z.object({
  found: z.boolean(),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
  description: z.string().max(1200),
}).refine(p => p.x + p.width <= 1.001 && p.y + p.height <= 1.001);

/** Locate existing pixels; never generate a replacement photograph. */
export const locateFurniturePhoto = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ imageDataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(4_000_000) }).parse(input))
  .handler(async ({ data }) => {
    const { openAIExtractJson } = await import("./openai-extract.server");
    const result = await openAIExtractJson({ maxTokens: 1200, parts: [
      { type: "text", text: 'Locate the ONE main photograph or perspective rendering of the complete furniture object in this image. Exclude page titles, swatches, captions, dimension lines and orthographic drawings. Keep ALL visible cushions, trim, legs and silhouette, with a small margin. If this is already one photograph use the full image. Return JSON {"found":true,"x":0,"y":0,"width":1,"height":1,"description":"visible shape, number of pillows, colors and materials"}. Coordinates are fractions of the FULL image, origin top left. If there is no perspective photo/rendering, found:false. Do not infer a photograph from a line drawing.' },
      { type: "image_url", image_url: { url: data.imageDataUrl } },
    ] });
    if (!result.ok) return result;
    try {
      const region = photoRegion.parse(JSON.parse(result.text));
      if (!region.found) return { ok: false as const, error: "Add a photo or perspective rendering of the furniture for photo-based reconstruction. Line drawings can use Editable approximation." };
      return { ok: true as const, region };
    } catch { return { ok: false as const, error: "The reference photo could not be located. Upload a photo cropped to the complete piece." }; }
  });
