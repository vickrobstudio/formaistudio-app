import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Subject = z.enum(["building", "furniture"]);
const PlanUnits = z.enum(["meters", "feet-inches"]);
const OutputUnits = z.enum(["meters", "feet"]);

const FloorTo3DInput = z.object({
  fileDataUrl: z
    .string()
    .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
    .max(2_700_000_000),
  wallHeightMeters: z.number().min(0.1).max(15).default(2.7),
  planUnits: PlanUnits.default("meters"),
  outputUnits: OutputUnits.default("meters"),
  subject: Subject.default("building"),
});

const OpeningSchema = z.object({
  kind: z.enum(["door", "window"]),
  position: z.number().min(0),
  width: z.number().positive(),
  sillHeight: z.number().min(0).default(0),
  headHeight: z.number().positive().default(2.1),
});

const WallSchema = z.object({
  name: z.string().max(60).optional(),
  layer: z.enum(["exterior", "interior"]).default("interior"),
  x1: z.number(), y1: z.number(),
  x2: z.number(), y2: z.number(),
  thickness: z.number().min(0.05).max(1).default(0.15),
  height: z.number().min(0.5).max(15).optional(),
  openings: z.array(OpeningSchema).max(20).default([]),
});

const ColumnSchema = z.object({
  name: z.string().max(60).optional(),
  cx: z.number(), cy: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  rotationDegZ: z.number().default(0),
});

const StairSchema = z.object({
  name: z.string().max(60).optional(),
  cx: z.number(), cy: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  steps: z.number().int().min(1).max(60).default(12),
  rotationDegZ: z.number().default(0),
});

const FixtureSchema = z.object({
  name: z.string().max(60).optional(),
  layer: z.string().max(40).default("fixtures"),
  cx: z.number(), cy: z.number(), cz: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  rotationDegZ: z.number().default(0),
});

const BuildingPlanSchema = z.object({
  kind: z.literal("building"),
  units: z.literal("meters"),
  bounds: z.object({ width: z.number().positive(), length: z.number().positive() }),
  walls: z.array(WallSchema).min(1).max(600),
  columns: z.array(ColumnSchema).max(200).default([]),
  stairs: z.array(StairSchema).max(40).default([]),
  fixtures: z.array(FixtureSchema).max(400).default([]),
});

const PartSchema = z.object({
  name: z.string().max(60).optional(),
  // Axis-aligned 3D box in meters, centered at (cx, cy, cz).
  cx: z.number(), cy: z.number(), cz: z.number(),
  width: z.number().positive(),   // along X
  depth: z.number().positive(),   // along Y
  height: z.number().positive(),  // along Z
  rotationDegZ: z.number().default(0),
});

const FurniturePlanSchema = z.object({
  kind: z.literal("furniture"),
  units: z.literal("meters"),
  bounds: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    height: z.number().positive(),
  }),
  parts: z.array(PartSchema).min(1).max(200),
});

type BuildingPlan = z.infer<typeof BuildingPlanSchema>;
type FurniturePlan = z.infer<typeof FurniturePlanSchema>;

type GenerateFloor3DResult =
  | { ok: true; daeDataUrl: string; elementCount: number; subject: "building" | "furniture"; outputUnits: "meters" | "feet" }
  | { ok: false; error: string };

const PRINTED_UNITS_NOTE: Record<z.infer<typeof PlanUnits>, string> = {
  "feet-inches": "The printed dimensions in the source are in FEET AND INCHES (e.g. 12'-6\", 8 ft, 14', 2'-3 1/2\"). Convert every dimension to meters precisely using 1 foot = 0.3048 m and 1 inch = 0.0254 m before placing coordinates.",
  meters: "The printed dimensions in the source are in METERS, millimeters or centimeters. Convert mm→m by /1000 and cm→m by /100.",
};

const ACCURACY_RULES = `ACCURACY IS CRITICAL:
- Read EVERY printed dimension (lengths, widths, depths, heights, thicknesses, diameters) and use those values exactly.
- Cross-check each dimension against the drawn geometry; if they disagree, trust the printed numerical dimension.
- Preserve every angle, alignment, parallel and perpendicular relationship.
- Round to no more than 3 decimal meters; do not round entire dimensions to whole numbers.
- Use a scale bar, grid or known reference if explicit dimensions are missing.
- Output JSON ONLY, no prose, no Markdown fences, parseable by JSON.parse.`;

function buildingInstruction(planUnits: z.infer<typeof PlanUnits>) {
  return `You are an architectural CAD vectorizer. Inspect the uploaded floor plan of a building (residential, office, retail, hospitality, industrial, etc.) and return STRICT JSON describing every wall.

${PRINTED_UNITS_NOTE[planUnits]}

Return JSON ONLY in this exact shape:
{
  "kind": "building",
  "units": "meters",
  "bounds": { "width": <plan width m>, "length": <plan length m> },
  "walls": [
    {
      "name": "<optional label>",
      "layer": "exterior" | "interior",
      "x1": <m>, "y1": <m>, "x2": <m>, "y2": <m>,
      "thickness": <m>,
      "height": <optional m, omit to use default ceiling>,
      "openings": [
        { "kind": "door"|"window", "position": <m from (x1,y1) along the wall>, "width": <m>, "sillHeight": <m>, "headHeight": <m> }
      ]
    }
  ],
  "columns": [ { "name": "<label>", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg> } ],
  "stairs":  [ { "name": "<label>", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "steps": <int>, "rotationDegZ": <deg> } ],
  "fixtures":[ { "name": "<label>", "layer": "kitchen"|"bath"|"furniture"|"appliance"|"plumbing"|"<other>", "cx": <m>, "cy": <m>, "cz": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg> } ]
}

Rules:
- Origin (0,0) at the bottom-left corner of the plan, +x right, +y up.
- Trace every exterior and interior wall as one straight segment between endpoints. Split walls at every intersection. Do NOT split a wall at a door or window — put the door/window in the wall's "openings" array so we can cut it cleanly.
- For each opening, "position" is the distance from (x1,y1) along the wall to the START of the opening. Doors: sillHeight 0, headHeight ~2.1 m. Windows: sillHeight ~0.9 m, headHeight ~2.1 m. Use printed dimensions when shown.
- Use the printed wall thickness when shown; otherwise 0.20 m exterior, 0.10 m interior.
- Mark walls "exterior" if they form the building envelope, otherwise "interior".
- Capture every structural column as a "columns" entry (rectangular or treat round columns as their bounding rectangle).
- Capture every staircase as a "stairs" entry with overall run width, run depth, total rise (height) and number of steps.
- Capture fixed furniture, kitchen cabinets, bath fixtures, appliances and plumbing as "fixtures" entries on the appropriate layer name so they import as separate SketchUp groups.
- IGNORE all MEP content entirely: HVAC ducts and diffusers, plumbing risers and waste lines, electrical outlets, switches, lighting fixtures, panels, conduit, fire sprinklers, data jacks, mechanical equipment schedules and any MEP legends. Do not output them as walls, columns or fixtures.
- Skip door swings, dimension lines, text, hatching, north arrows, gridlines, title blocks.
- Keep the model SIMPLE: only walls, doors, windows, columns, stairs and visible furniture / cabinets / bath fixtures. Each distinct element is its own entry so it becomes its own group on import.

${ACCURACY_RULES}`;
}

function furnitureInstruction(planUnits: z.infer<typeof PlanUnits>) {
  return `You are a furniture vectorizer. Inspect the uploaded technical drawing of ONE furniture piece (top, front, side or orthographic views) and return STRICT JSON describing it as a set of axis-aligned 3D boxes (parts) that together approximate its real geometry.

${PRINTED_UNITS_NOTE[planUnits]}

Return JSON ONLY in this exact shape:
{
  "kind": "furniture",
  "units": "meters",
  "bounds": { "width": <overall X m>, "depth": <overall Y m>, "height": <overall Z m> },
  "parts": [
    { "name": "<part name>", "cx": <m>, "cy": <m>, "cz": <m>, "width": <X m>, "depth": <Y m>, "height": <Z m>, "rotationDegZ": <deg> }
  ]
}

Rules:
- World axes: +X = piece width (left→right of the front view), +Y = piece depth (front→back), +Z = piece height (floor→top). Origin (0,0,0) at the bottom-front-left corner of the bounding box.
- (cx, cy, cz) is the CENTER of each box. (width, depth, height) are full extents along the local X/Y/Z BEFORE rotation. rotationDegZ rotates the box around its vertical Z axis (positive = counter-clockwise viewed from above), default 0.
- Decompose the piece into the smallest set of parts that reproduces its real shape: seat, back, armrests, legs, stretchers, frame rails, top, drawers, shelves, base, supports. Match each part's true thickness from the drawing.
- Use the printed overall width/depth/height for "bounds" and the printed part dimensions for each box.
- Use realistic typical thicknesses only when the drawing does not give them (e.g. 0.02 m panels, 0.05 m legs).

${ACCURACY_RULES}`;
}

type Group = { id: string; name: string; positions: number[]; indices: number[] };

function makeGroupBuilder(id: string, name: string, scale: number): {
  group: Group;
  addCorners: (corners: [number, number, number][]) => void;
  addBox: (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => void;
} {
  const group: Group = { id, name, positions: [], indices: [] };
  function addCorners(corners: [number, number, number][]) {
    const base = group.positions.length / 3;
    for (const [x, y, z] of corners) group.positions.push(x * scale, y * scale, z * scale);
    const faces: [number, number, number, number][] = [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 4, 5, 1],
      [1, 5, 6, 2],
      [2, 6, 7, 3],
      [3, 7, 4, 0],
    ];
    for (const [a, b, c, d] of faces) {
      group.indices.push(base + a, base + b, base + c, base + a, base + c, base + d);
    }
  }
  function addBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) {
    addCorners([
      [minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ],
      [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ],
    ]);
  }
  return { group, addCorners, addBox };
}

function addRotatedBox(
  addCorners: (corners: [number, number, number][]) => void,
  cx: number, cy: number, cz: number,
  width: number, depth: number, height: number,
  rotationDegZ: number,
) {
  const hx = width / 2, hy = depth / 2, hz = height / 2;
  const local: [number, number, number][] = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  const theta = (rotationDegZ * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  addCorners(local.map(([x, y, z]) => [
    cx + x * cos - y * sin,
    cy + x * sin + y * cos,
    cz + z,
  ]));
}

function addWallWithOpenings(
  addCorners: (corners: [number, number, number][]) => void,
  wall: z.infer<typeof WallSchema>,
  defaultHeight: number,
) {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.05) return;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const t = wall.thickness / 2;
  const top = wall.height ?? defaultHeight;

  function piece(d0: number, d1: number, z0: number, z1: number) {
    if (d1 - d0 < 0.01 || z1 - z0 < 0.01) return;
    const sx = wall.x1 + ux * d0, sy = wall.y1 + uy * d0;
    const ex = wall.x1 + ux * d1, ey = wall.y1 + uy * d1;
    const p1: [number, number, number] = [sx + nx * t, sy + ny * t, z0];
    const p2: [number, number, number] = [ex + nx * t, ey + ny * t, z0];
    const p3: [number, number, number] = [ex - nx * t, ey - ny * t, z0];
    const p4: [number, number, number] = [sx - nx * t, sy - ny * t, z0];
    addCorners([
      p1, p2, p3, p4,
      [p1[0], p1[1], z1],
      [p2[0], p2[1], z1],
      [p3[0], p3[1], z1],
      [p4[0], p4[1], z1],
    ]);
  }

  const openings = [...wall.openings]
    .map((o) => ({ ...o, start: Math.max(0, Math.min(len, o.position)), end: Math.max(0, Math.min(len, o.position + o.width)) }))
    .filter((o) => o.end > o.start)
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const op of openings) {
    if (op.start > cursor) piece(cursor, op.start, 0, top);
    const sill = Math.min(op.sillHeight, top);
    const head = Math.min(op.headHeight, top);
    if (sill > 0) piece(op.start, op.end, 0, sill);
    if (head < top) piece(op.start, op.end, head, top);
    cursor = op.end;
  }
  if (cursor < len) piece(cursor, len, 0, top);
}

function buildGroups(
  plan: BuildingPlan | FurniturePlan,
  wallHeightMeters: number,
  outputUnits: "meters" | "feet",
): Group[] {
  const scale = outputUnits === "feet" ? 1 / 0.3048 : 1;
  const groups: Group[] = [];

  if (plan.kind === "building") {
    const slab = makeGroupBuilder("group_slab", "Slab", scale);
    slab.addBox(0, 0, -0.05, plan.bounds.width, plan.bounds.length, 0);
    groups.push(slab.group);

    const exterior = makeGroupBuilder("group_walls_exterior", "Walls - Exterior", scale);
    const interior = makeGroupBuilder("group_walls_interior", "Walls - Interior", scale);
    for (const wall of plan.walls) {
      const target = wall.layer === "exterior" ? exterior : interior;
      addWallWithOpenings(target.addCorners, wall, wallHeightMeters);
    }
    if (exterior.group.positions.length) groups.push(exterior.group);
    if (interior.group.positions.length) groups.push(interior.group);

    if (plan.columns.length) {
      const g = makeGroupBuilder("group_columns", "Columns", scale);
      for (const c of plan.columns) {
        addRotatedBox(g.addCorners, c.cx, c.cy, c.height / 2, c.width, c.depth, c.height, c.rotationDegZ);
      }
      groups.push(g.group);
    }
    if (plan.stairs.length) {
      const g = makeGroupBuilder("group_stairs", "Stairs", scale);
      for (const s of plan.stairs) {
        const stepRise = s.height / s.steps;
        const stepRun = s.depth / s.steps;
        const theta = (s.rotationDegZ * Math.PI) / 180;
        const cos = Math.cos(theta), sin = Math.sin(theta);
        const halfW = s.width / 2;
        for (let i = 0; i < s.steps; i++) {
          const yLocal = -s.depth / 2 + i * stepRun;
          const tread: [number, number][] = [[-halfW, yLocal], [halfW, yLocal], [halfW, s.depth / 2], [-halfW, s.depth / 2]];
          const z0 = 0;
          const z1 = (i + 1) * stepRise;
          const world = tread.map(([lx, ly]) => [s.cx + lx * cos - ly * sin, s.cy + lx * sin + ly * cos] as [number, number]);
          g.addCorners([
            [world[0][0], world[0][1], z0], [world[1][0], world[1][1], z0], [world[2][0], world[2][1], z0], [world[3][0], world[3][1], z0],
            [world[0][0], world[0][1], z1], [world[1][0], world[1][1], z1], [world[2][0], world[2][1], z1], [world[3][0], world[3][1], z1],
          ]);
        }
      }
      groups.push(g.group);
    }
    if (plan.fixtures.length) {
      const byLayer = new Map<string, ReturnType<typeof makeGroupBuilder>>();
      for (const f of plan.fixtures) {
        const layerKey = (f.layer || "fixtures").trim().toLowerCase() || "fixtures";
        let bucket = byLayer.get(layerKey);
        if (!bucket) {
          const safe = layerKey.replace(/[^a-z0-9]+/g, "_");
          bucket = makeGroupBuilder(`group_fixtures_${safe}`, `Fixtures - ${layerKey}`, scale);
          byLayer.set(layerKey, bucket);
        }
        addRotatedBox(bucket.addCorners, f.cx, f.cy, f.cz, f.width, f.depth, f.height, f.rotationDegZ);
      }
      for (const bucket of byLayer.values()) groups.push(bucket.group);
    }
  } else {
    plan.parts.forEach((part, i) => {
      const safe = (part.name || `part_${i + 1}`).replace(/[^A-Za-z0-9]+/g, "_");
      const g = makeGroupBuilder(`group_${safe}_${i}`, part.name || `Part ${i + 1}`, scale);
      addRotatedBox(g.addCorners, part.cx, part.cy, part.cz, part.width, part.depth, part.height, part.rotationDegZ);
      groups.push(g.group);
    });
  }

  return groups.filter((g) => g.positions.length > 0);
}

function buildDae(
  plan: BuildingPlan | FurniturePlan,
  wallHeightMeters: number,
  outputUnits: "meters" | "feet",
) {
  const groups = buildGroups(plan, wallHeightMeters, outputUnits);
  const created = new Date().toISOString();
  const unitTag = outputUnits === "feet"
    ? '<unit name="foot" meter="0.3048"/>'
    : '<unit name="meter" meter="1"/>';

  const geometriesXml = groups.map((g) => {
    const positionText = g.positions.map((n) => n.toFixed(4)).join(" ");
    const triCount = g.indices.length / 3;
    const pIndex = g.indices.join(" ");
    return `    <geometry id="${g.id}_geom" name="${g.name}">
      <mesh>
        <source id="${g.id}_pos">
          <float_array id="${g.id}_pos_array" count="${g.positions.length}">${positionText}</float_array>
          <technique_common><accessor source="#${g.id}_pos_array" count="${g.positions.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common>
        </source>
        <vertices id="${g.id}_vtx"><input semantic="POSITION" source="#${g.id}_pos"/></vertices>
        <triangles material="solidMaterialSG" count="${triCount}">
          <input semantic="VERTEX" source="#${g.id}_vtx" offset="0"/>
          <p>${pIndex}</p>
        </triangles>
      </mesh>
    </geometry>`;
  }).join("\n");

  const nodesXml = groups.map((g) => `      <node id="${g.id}_node" name="${g.name}">
        <instance_geometry url="#${g.id}_geom">
          <bind_material><technique_common><instance_material symbol="solidMaterialSG" target="#solidMaterial"/></technique_common></bind_material>
        </instance_geometry>
      </node>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor><authoring_tool>FormAI STUDIO 2D to 3D</authoring_tool></contributor>
    <created>${created}</created>
    <modified>${created}</modified>
    ${unitTag}
    <up_axis>Z_UP</up_axis>
  </asset>
  <library_effects>
    <effect id="solidEffect"><profile_COMMON><technique sid="common"><lambert><diffuse><color>0.85 0.85 0.85 1</color></diffuse></lambert></technique></profile_COMMON></effect>
  </library_effects>
  <library_materials>
    <material id="solidMaterial" name="Solid"><instance_effect url="#solidEffect"/></material>
  </library_materials>
  <library_geometries>
${geometriesXml}
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="Scene" name="Scene">
${nodesXml}
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
    const instruction = data.subject === "furniture"
      ? furnitureInstruction(data.planUnits)
      : buildingInstruction(data.planUnits);
    const userContent = isPdf
      ? [
          { type: "text", text: instruction },
          { type: "file", file: { filename: "source.pdf", file_data: data.fileDataUrl } },
        ]
      : [
          { type: "text", text: instruction },
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
      console.error("2d-to-3d extract failed", upstream.status, detail.slice(0, 400));
      if (upstream.status === 402) return { ok: false, error: "AI credits are exhausted." };
      if (upstream.status === 429) return { ok: false, error: "The studio is busy. Please retry shortly." };
      return { ok: false, error: "The drawing could not be analysed." };
    }

    const payload = (await upstream.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) return { ok: false, error: "The AI did not return a description." };

    let parsed: unknown;
    try {
      const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, error: "The AI response was not valid JSON." };
    }

    const schema = data.subject === "furniture" ? FurniturePlanSchema : BuildingPlanSchema;
    const planResult = schema.safeParse(parsed);
    if (!planResult.success) {
      console.error("2d-to-3d plan invalid", planResult.error.issues.slice(0, 5));
      return { ok: false, error: "The detected geometry was incomplete. Try a clearer drawing with visible dimensions." };
    }

    const plan = planResult.data;
    const dae = buildDae(plan, data.wallHeightMeters, data.outputUnits);
    const daeDataUrl = `data:model/vnd.collada+xml;base64,${Buffer.from(dae, "utf8").toString("base64")}`;
    const elementCount = plan.kind === "building"
      ? plan.walls.length + plan.columns.length + plan.stairs.length + plan.fixtures.length
      : plan.parts.length;
    return { ok: true, daeDataUrl, elementCount, subject: plan.kind, outputUnits: data.outputUnits };
  });