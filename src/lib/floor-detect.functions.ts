import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  imageDataUrl: z
    .string()
    .regex(/^data:image\/(?:png|jpeg|webp);base64,/)
    .max(40_000_000),
  label: z.string().max(80).optional(),
});

export type DetectedCategory =
  | "wall"
  | "door"
  | "window"
  | "stair"
  | "room"
  | "fixture";

export type DetectedElement = {
  id: string;
  category: DetectedCategory;
  label: string;
  polygon: Array<[number, number]>;
  confidence: number;
};

type Result =
  | { ok: true; elements: DetectedElement[] }
  | { ok: false; error: string };

const SYSTEM = `You are an architectural drawing analyst. The user uploads ONE floor plan image. Identify the discrete elements visible in the drawing: WALLS, DOORS, WINDOWS, STAIRS, ROOMS (closed habitable spaces — kitchen, bath, bedroom, living, hall, etc.), and FIXTURES (fixed plumbing, sinks, toilets, tubs, counters, appliances, built-ins).

For each element, return a polygon outlining it on the drawing in IMAGE-NORMALIZED coordinates where (0,0) is the top-left corner of the image and (1,1) is the bottom-right corner. Use 3–10 points per polygon — a tight outline is enough; do not be photo-pixel-perfect. Walls can be represented as thin rectangles (4 points). Rooms are the interior floor polygon (4–8 points).

Return STRICT JSON matching this shape, and nothing else:

{
  "elements": [
    { "id": "w1", "category": "wall", "label": "north exterior wall", "polygon": [[0.05,0.10],[0.95,0.10],[0.95,0.12],[0.05,0.12]], "confidence": 0.9 }
  ]
}

RULES:
- Output JSON only. No markdown, no commentary, no code fences.
- Categories MUST be one of: wall, door, window, stair, room, fixture.
- Use short, human-readable labels (e.g. "kitchen", "master bedroom", "main entry door", "egress window", "interior partition", "U-stair").
- Aim for completeness on rooms and openings — every closed habitable space should be a "room", every door swing/symbol a "door", every window in a wall a "window".
- Cap at 80 elements total to stay concise. Prefer rooms and openings over individual wall segments when crowded.
- All polygon coordinates must be numbers in [0,1]. Skip anything you cannot place spatially.`;

export const detectFloorElements = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<Result> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false, error: "The detection service is unavailable." };

    const userContent = [
      { type: "text", text: SYSTEM },
      { type: "image_url", image_url: { url: data.imageDataUrl } },
      ...(data.label ? [{ type: "text", text: `Drawing label: ${data.label}` }] : []),
    ];

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Lovable-API-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: userContent }],
        response_format: { type: "json_object" },
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("floor-detect failed", upstream.status, detail.slice(0, 400));
      if (upstream.status === 402) return { ok: false, error: "AI credits are exhausted." };
      if (upstream.status === 429) return { ok: false, error: "The studio is busy. Please retry shortly." };
      return { ok: false, error: "Element detection failed." };
    }

    const payload = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: unknown;
    try { parsed = JSON.parse(jsonText); } catch {
      console.error("floor-detect non-JSON", raw.slice(0, 400));
      return { ok: false, error: "Detection returned an unreadable response." };
    }

    const Schema = z.object({
      elements: z.array(z.object({
        id: z.string().max(40).optional(),
        category: z.enum(["wall", "door", "window", "stair", "room", "fixture"]),
        label: z.string().max(80),
        polygon: z.array(z.tuple([z.number(), z.number()])).min(3).max(40),
        confidence: z.number().min(0).max(1).optional(),
      })).max(120),
    });

    const validated = Schema.safeParse(parsed);
    if (!validated.success) {
      console.error("floor-detect bad shape", validated.error.issues.slice(0, 3));
      return { ok: false, error: "Detection returned an invalid shape." };
    }

    const elements: DetectedElement[] = validated.data.elements.map((el, i) => ({
      id: el.id?.trim() || `el-${i}`,
      category: el.category,
      label: el.label.trim() || el.category,
      polygon: el.polygon.map(([x, y]) => [
        Math.max(0, Math.min(1, x)),
        Math.max(0, Math.min(1, y)),
      ] as [number, number]),
      confidence: el.confidence ?? 0.5,
    }));

    return { ok: true, elements };
  });