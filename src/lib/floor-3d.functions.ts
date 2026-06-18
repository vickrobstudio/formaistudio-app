import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const FloorTo3DInput = z.object({
  fileDataUrl: z
    .string()
    .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
    .max(20_000_000),
  wallHeightMeters: z.number().min(1).max(10).default(2.7),
});

const WallSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  thickness: z.number().min(0.05).max(1).default(0.15),
});

const PlanSchema = z.object({
  units: z.literal("meters"),
  bounds: z.object({ width: z.number().positive(), length: z.number().positive() }),
  walls: z.array(WallSchema).min(1).max(400),
});

type GenerateFloor3DResult =
  | { ok: true; daeDataUrl: string; wallCount: number }
  | { ok: false; error: string };

const EXTRACT_INSTRUCTION = `You are an architectural CAD vectorizer. Inspect the uploaded floor plan (a residential, office, or other architectural building plan) and return STRICT JSON describing every wall as a straight line segment.

Return JSON ONLY, no prose, matching this exact shape:
{
  "units": "meters",
  "bounds": { "width": <plan width in meters>, "length": <plan length in meters> },
  "walls": [ { "x1": <m>, "y1": <m>, "x2": <m>, "y2": <m>, "thickness": <m, default 0.15> } ]
}

Rules:
- Coordinates in meters with origin (0,0) at the bottom-left corner of the plan and +x going right, +y going up.
- Read any printed scale, dimensions or grid to infer real-world meters. If no scale is shown, assume the longest exterior side is 12 meters and scale everything proportionally.
- Trace every exterior and interior wall as one straight segment from endpoint to endpoint. Split walls at every intersection or door opening so each segment is a clean straight line.
- Skip door swings, furniture, dimension lines, text, hatching, north arrows, columns and stairs.
- Use 0.20 m thickness for exterior walls and 0.10 m for interior partitions when unsure.
- Output must be valid JSON parseable by JSON.parse. No comments, no trailing commas, no Markdown fences.`;

function buildDae(plan: z.infer<typeof PlanSchema>, wallHeight: number) {
  const positions: number[] = [];
  const indices: number[] = [];

  function addBox(corners: [number, number, number][]) {
    const base = positions.length / 3;
    for (const [x, y, z] of corners) positions.push(x, y, z);
    // 6 faces, 2 tris each. corners order: 0-3 bottom (CCW), 4-7 top (CCW)
    const faces: [number, number, number, number][] = [
      [0, 1, 2, 3], // bottom
      [4, 7, 6, 5], // top (reversed for outward normal)
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0],
    ];
    for (const [a, b, c, d] of faces) {
      indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
    }
  }

  // Floor slab
  const { width, length } = plan.bounds;
  addBox([
    [0, 0, -0.05],
    [width, 0, -0.05],
    [width, length, -0.05],
    [0, length, -0.05],
    [0, 0, 0],
    [width, 0, 0],
    [width, length, 0],
    [0, length, 0],
  ]);

  for (const wall of plan.walls) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.05) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const t = wall.thickness / 2;
    const p1x = wall.x1 + nx * t, p1y = wall.y1 + ny * t;
    const p2x = wall.x2 + nx * t, p2y = wall.y2 + ny * t;
    const p3x = wall.x2 - nx * t, p3y = wall.y2 - ny * t;
    const p4x = wall.x1 - nx * t, p4y = wall.y1 - ny * t;
    addBox([
      [p1x, p1y, 0],
      [p2x, p2y, 0],
      [p3x, p3y, 0],
      [p4x, p4y, 0],
      [p1x, p1y, wallHeight],
      [p2x, p2y, wallHeight],
      [p3x, p3y, wallHeight],
      [p4x, p4y, wallHeight],
    ]);
  }

  const positionText = positions.map((n) => n.toFixed(4)).join(" ");
  const triCount = indices.length / 3;
  const pIndex: string[] = [];
  for (let i = 0; i < indices.length; i += 1) pIndex.push(String(indices[i]));
  const created = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor><authoring_tool>FormAI STUDIO 2D to 3D</authoring_tool></contributor>
    <created>${created}</created>
    <modified>${created}</modified>
    <unit name="meter" meter="1"/>
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_effects>
    <effect id="wallEffect"><profile_COMMON><technique sid="common"><lambert><diffuse><color>0.85 0.85 0.85 1</color></diffuse></lambert></technique></profile_COMMON></effect>
  </library_effects>
  <library_materials>
    <material id="wallMaterial" name="Wall"><instance_effect url="#wallEffect"/></material>
  </library_materials>
  <library_geometries>
    <geometry id="floorplanGeom" name="FloorPlan">
      <mesh>
        <source id="floorplanPositions">
          <float_array id="floorplanPositionsArray" count="${positions.length}">${positionText}</float_array>
          <technique_common><accessor source="#floorplanPositionsArray" count="${positions.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common>
        </source>
        <vertices id="floorplanVertices"><input semantic="POSITION" source="#floorplanPositions"/></vertices>
        <triangles material="wallMaterialSG" count="${triCount}">
          <input semantic="VERTEX" source="#floorplanVertices" offset="0"/>
          <p>${pIndex.join(" ")}</p>
        </triangles>
      </mesh>
    </geometry>
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
      <node id="FloorPlanNode" name="FloorPlan">
        <instance_geometry url="#floorplanGeom">
          <bind_material><technique_common><instance_material symbol="wallMaterialSG" target="#wallMaterial"/></technique_common></bind_material>
        </instance_geometry>
      </node>
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;
}

export const generateFloor3D = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FloorTo3DInput.parse(input))
  .handler(async ({ data }): Promise<GenerateFloor3DResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { ok: false, error: "The 2D to 3D service is unavailable." };

    const isPdf = data.fileDataUrl.startsWith("data:application/pdf");
    const userContent = isPdf
      ? [
          { type: "text", text: EXTRACT_INSTRUCTION },
          { type: "file", file: { filename: "plan.pdf", file_data: data.fileDataUrl } },
        ]
      : [
          { type: "text", text: EXTRACT_INSTRUCTION },
          { type: "image_url", image_url: { url: data.fileDataUrl } },
        ];

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: userContent }],
        response_format: { type: "json_object" },
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("floor-3d extract failed", upstream.status, detail.slice(0, 400));
      if (upstream.status === 402) return { ok: false, error: "AI credits are exhausted." };
      if (upstream.status === 429) return { ok: false, error: "The studio is busy. Please retry shortly." };
      return { ok: false, error: "The floor plan could not be analysed." };
    }

    const payload = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, error: "The AI did not return a plan description." };

    let parsed: unknown;
    try {
      const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: "The AI response was not valid JSON." };
    }

    const planResult = PlanSchema.safeParse(parsed);
    if (!planResult.success) {
      console.error("floor-3d plan invalid", planResult.error.issues.slice(0, 5));
      return { ok: false, error: "The detected walls were incomplete. Try a clearer plan." };
    }

    const dae = buildDae(planResult.data, data.wallHeightMeters);
    const daeDataUrl = `data:model/vnd.collada+xml;base64,${Buffer.from(dae, "utf8").toString("base64")}`;
    return { ok: true, daeDataUrl, wallCount: planResult.data.walls.length };
  });