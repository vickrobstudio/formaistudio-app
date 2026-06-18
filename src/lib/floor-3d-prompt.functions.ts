import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  fileDataUrl: z
    .string()
    .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
    .max(2_700_000_000),
  subject: z.enum(["building", "furniture"]).default("furniture"),
});

type Result = { ok: true; prompt: string } | { ok: false; error: string };

const SYSTEM = `You read a technical drawing of a single furniture piece or a single architectural building and return ONE rich descriptive paragraph that an image-generation model can use to render a photoreal hero image of the finished object.

The paragraph must include:
- The object type and overall silhouette/shape (e.g. "oval bar-height pedestal table", "L-shaped sectional sofa").
- EVERY distinct part with its real-world dimension and material — read printed callouts, dimensions and material codes (e.g. "ST-05 Calacatta stone top 2'-10\" × 1'-8\" with 1/8\" scalloped reveal and full bullnose oak edge profile WD-09, 3\" Ø solid white oak tapered pedestal column 2'-4\" tall, brass MT-02 footrest ring, 1'-0\" diameter solid oak base disc with heavy-duty glides, total height 3'-6\"").
- Materials and finishes called out in the drawing or visible in reference photos (stone type, wood species, metal finish, leather/fabric, glass).
- Lighting and camera: soft studio lighting, three-quarter view, neutral seamless background, 50mm lens, eye-level for furniture / interior architectural shot for buildings.
- The look: photoreal, 8K, luxury editorial product photography, realistic warm white balance, accurate material reflectance, natural contact shadows, no text, no logos, no watermarks.

Return ONLY the paragraph as plain text — no JSON, no Markdown, no headings, no bullet points.`;

export const buildMasterPrompt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<Result> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false, error: "The rendering service is unavailable." };

    const isPdf = data.fileDataUrl.startsWith("data:application/pdf");
    const userContent = isPdf
      ? [
          { type: "text", text: SYSTEM },
          { type: "file", file: { filename: "source.pdf", file_data: data.fileDataUrl } },
        ]
      : [
          { type: "text", text: SYSTEM },
          { type: "image_url", image_url: { url: data.fileDataUrl } },
        ];

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
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