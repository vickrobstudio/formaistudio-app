import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { FORM_AI_2D_TO_3D_SYSTEM_PROMPT } from "./form-ai-system-prompt";

// Given a thumbnail of the cleaned floor plan with each detected region
// outlined and numbered, ask the AI to label each region with a category
// and a short room name (Kitchen, Living, Bath 1...). Much more reliable
// than free-form detection because the polygons are already extracted —
// the AI only needs to NAME each one.

const RegionInput = z.object({
  id: z.string().max(40),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  areaFraction: z.number().min(0).max(1),
});

const Input = z.object({
  imageDataUrl: z
    .string()
    .regex(/^data:image\/(?:png|jpeg|webp);base64,/)
    .max(20_000_000),
  regions: z.array(RegionInput).min(1).max(2000),
  hint: z.string().max(200).optional(),
});

export type ClassifiedRegion = {
  id: string;
  category: "room" | "wall" | "door" | "window" | "stair" | "fixture";
  label: string;
  confidence: number;
};

type Result =
  | { ok: true; regions: ClassifiedRegion[] }
  | { ok: false; error: string };

const SYSTEM = `${FORM_AI_2D_TO_3D_SYSTEM_PROMPT}

--- TASK-SPECIFIC INSTRUCTIONS (Step 3 + Step 6: classify enclosed regions) ---

You are now executing Steps 3 and 6 of the pipeline above. The user gives you ONE cleaned floor plan image where every enclosed region has been outlined in RED and labeled with a NUMBER (1, 2, 3...). You also receive the JSON list of those numbered regions with their bounding boxes (normalized 0..1) and area fractions.

For EVERY numbered region, return a category and a short human label.

CATEGORIES (use exactly one):
- room: a habitable enclosed space (kitchen, living, bedroom, bath, hallway, closet, garage...)
- stair: a stair shaft
- fixture: a fixed appliance/plumbing block (tub, shower, WC, sink, kitchen island, counter run)
- wall: a thick solid wall block (rare for enclosed regions; usually only if a region is a thick wall poche)
- door: a door swing/opening region
- window: a window region

LABEL: short, human, e.g. "Kitchen", "Master Bath", "Living", "Hall", "Closet 1", "Stair", "Tub", "WC". Use the visual cues — plumbing fixtures = bath/kitchen, large open space = living, smaller rooms with bed-like shapes = bedroom.

RETURN STRICT JSON ONLY:
{ "regions": [ { "id": "<exact id from input>", "category": "room", "label": "Kitchen", "confidence": 0.9 } ] }

RULES:
- One entry per input region, same id.
- No markdown, no commentary, JSON only.
- Confidence in [0,1].`;

export const classifyFloorRegions = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }): Promise<Result> => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, error: "The classification service is unavailable." };

    const regionsJson = JSON.stringify({ regions: data.regions });
    const userContent = [
      { type: "text", text: SYSTEM },
      { type: "image_url", image_url: { url: data.imageDataUrl } },
      { type: "text", text: `REGIONS:\n${regionsJson}` },
      ...(data.hint ? [{ type: "text", text: `Drawing hint: ${data.hint}` }] : []),
    ];

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
},
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [{ role: "user", content: userContent }],
        response_format: { type: "json_object" },
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("floor-classify failed", upstream.status, detail.slice(0, 400));
      if (upstream.status === 402) return { ok: false, error: "AI credits are exhausted." };
      if (upstream.status === 429) return { ok: false, error: "The studio is busy. Please retry shortly." };
      return { ok: false, error: "Region classification failed." };
    }

    const payload = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: unknown;
    try { parsed = JSON.parse(jsonText); } catch {
      console.error("floor-classify non-JSON", raw.slice(0, 400));
      return { ok: false, error: "Classifier returned an unreadable response." };
    }
    const Schema = z.object({
      regions: z.array(z.object({
        id: z.string().max(40),
        category: z.enum(["room", "wall", "door", "window", "stair", "fixture"]),
        label: z.string().max(60),
        confidence: z.number().min(0).max(1).optional(),
      })).max(2000),
    });
    const validated = Schema.safeParse(parsed);
    if (!validated.success) {
      console.error("floor-classify bad shape", validated.error.issues.slice(0, 3));
      return { ok: false, error: "Classifier returned an invalid shape." };
    }
    const byId = new Map<string, ClassifiedRegion>();
    for (const r of validated.data.regions) {
      byId.set(r.id, {
        id: r.id,
        category: r.category,
        label: r.label.trim() || r.category,
        confidence: r.confidence ?? 0.5,
      });
    }
    // Fill in any region the AI skipped with a generic room label.
    const regions: ClassifiedRegion[] = data.regions.map((reg, i) => byId.get(reg.id) ?? {
      id: reg.id,
      category: "room",
      label: `Room ${i + 1}`,
      confidence: 0.3,
    });
    return { ok: true, regions };
  });
