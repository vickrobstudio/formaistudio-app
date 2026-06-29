import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MATERIAL_IDS, MATERIAL_PALETTE, type MaterialId } from "./floor-3d-shared";

const Subject = z.enum(["building", "furniture"]);
const PlanUnits = z.enum(["meters", "feet-inches"]);
const OutputUnits = z.enum(["meters", "feet"]);

const FloorTo3DInput = z.object({
  fileDataUrl: z
    .string()
    .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
    .max(2_700_000_000)
    .optional(),
  wallHeightMeters: z.number().min(0.1).max(15).default(2.7),
  planUnits: PlanUnits.default("meters"),
  outputUnits: OutputUnits.default("meters"),
  subject: Subject.default("building"),
  // OPTIONAL — the approved hero rendering and its master prompt. When
  // provided, the geometry model treats the rendering as the SOURCE OF TRUTH
  // for silhouette, part grouping and proportion, so the live 3D preview
  // matches the image the user already approved.
  approvedRenderUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,/)
    .max(50_000_000)
    .optional(),
  masterPrompt: z.string().max(8000).optional(),
  referenceOnly: z.boolean().default(false).optional(),
  // Additional reference renderings/photographs the user attached. In
  // referenceOnly mode every one of these is sent to the modeler so the
  // reconstructed 3D piece matches the references at 100% fidelity from
  // every visible angle.
  referenceImages: z
    .array(z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(50_000_000))
    .max(6)
    .default([])
    .optional(),
  // NEW — multi-image building flow: one image per floor + optional roof
  // plan + elevations. When present (and subject === "building"), this
  // payload is used INSTEAD of the single-image fileDataUrl flow and the
  // 3D model is built directly from the drawings, with no master prompt
  // and no approval render.
  building: z
    .object({
      floors: z
        .array(
          z.object({
            imageDataUrl: z
              .string()
              .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
              .max(50_000_000),
            label: z.string().max(60).optional(),
            heightMeters: z.number().min(1).max(10).default(2.7),
          }),
        )
        .min(1)
        .max(10),
      roof: z
        .object({
          imageDataUrl: z
            .string()
            .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
            .max(50_000_000),
        })
        .optional(),
      elevations: z
        .array(
          z.object({
            imageDataUrl: z
              .string()
              .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
              .max(50_000_000),
            facing: z.enum(["N", "S", "E", "W", "other"]).default("other"),
            label: z.string().max(60).optional(),
          }),
        )
        .max(8)
        .default([])
        .optional(),
    })
    .optional(),
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
  material: z.enum(MATERIAL_IDS).default("other"),
  materialNote: z.string().max(120).optional(),
  colorHex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
});

const ColumnSchema = z.object({
  name: z.string().max(60).optional(),
  cx: z.number(), cy: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  rotationDegZ: z.number().default(0),
  material: z.enum(MATERIAL_IDS).default("other"),
  materialNote: z.string().max(120).optional(),
  colorHex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
});

const StairSchema = z.object({
  name: z.string().max(60).optional(),
  cx: z.number(), cy: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  steps: z.number().int().min(1).max(60).default(12),
  rotationDegZ: z.number().default(0),
  material: z.enum(MATERIAL_IDS).default("other"),
  materialNote: z.string().max(120).optional(),
  colorHex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
});

const FixtureSchema = z.object({
  name: z.string().max(60).optional(),
  layer: z.string().max(40).default("fixtures"),
  cx: z.number(), cy: z.number(), cz: z.number(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  rotationDegZ: z.number().default(0),
  material: z.enum(MATERIAL_IDS).default("other"),
  materialNote: z.string().max(120).optional(),
  colorHex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
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
  // Shape primitive: axis-aligned box, vertical cylinder, or vertical
  // elliptical cylinder (width = X diameter, depth = Y diameter). All shapes
  // are centered at (cx, cy, cz) and extruded along Z.
  shape: z.enum([
    "box",
    "cylinder",
    "ellipse_cylinder",
    "tapered_cylinder",
    "torus",
    "rounded_box",
    "custom_extrusion",
  ]).default("box"),
  cx: z.number(), cy: z.number(), cz: z.number(),
  width: z.number().positive(),   // along X
  depth: z.number().positive(),   // along Y
  height: z.number().positive(),  // along Z
  rotationDegZ: z.number().default(0),
  // custom_extrusion only: normalized plan-view outline points where [0,0]
  // is part center and extents fit inside -0.5..0.5. Used for scalloped,
  // kidney, boomerang, freeform, arched and asymmetric silhouettes from the
  // approved render.
  outline: z.array(z.tuple([z.number().min(-0.75).max(0.75), z.number().min(-0.75).max(0.75)])).min(3).max(96).optional(),
  // Optional shape-specific extras (in meters):
  // - tapered_cylinder: topDiameter (X diameter at the top, Y scales proportionally)
  // - torus: tubeDiameter (thickness of the ring)
  // - rounded_box / cylinder / ellipse_cylinder: edgeRadius for bullnose/fillet (visual approximation)
  topDiameter: z.number().positive().optional(),
  tubeDiameter: z.number().positive().optional(),
  edgeRadius: z.number().min(0).optional(),
  // Material slot — used both to render the live 3D preview and to group the
  // .dae export into one selectable material layer per material.
  material: z.enum(MATERIAL_IDS).default("other"),
  materialNote: z.string().max(120).optional(),
  colorHex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
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

const MultiFloorBuildingPlanSchema = z.object({
  kind: z.literal("multi_floor_building"),
  units: z.literal("meters"),
  bounds: z.object({ width: z.number().positive(), length: z.number().positive() }),
  floors: z
    .array(
      z.object({
        index: z.number().int().min(0).max(20),
        label: z.string().max(60).optional(),
        heightMeters: z.number().min(1).max(10),
        walls: z.array(WallSchema).min(0).max(600).default([]),
        columns: z.array(ColumnSchema).max(200).default([]),
        stairs: z.array(StairSchema).max(40).default([]),
        fixtures: z.array(FixtureSchema).max(400).default([]),
      }),
    )
    .min(1)
    .max(10),
  roof: z
    .object({
      kind: z.enum(["flat", "gable", "hip", "shed"]).default("flat"),
      thicknessMeters: z.number().min(0.05).max(0.6).default(0.2),
      overhangMeters: z.number().min(0).max(2).default(0.3).optional(),
      ridgeHeightMeters: z.number().min(0).max(8).optional(),
      ridgeAxis: z.enum(["x", "y"]).optional(),
    })
    .optional(),
});
type MultiFloorBuildingPlan = z.infer<typeof MultiFloorBuildingPlanSchema>;

type GenerateFloor3DResult =
  | { ok: true; daeDataUrl: string; objDataUrl: string; fbxDataUrl: string; elementCount: number; subject: "building" | "furniture"; outputUnits: "meters" | "feet"; plan: BuildingPlan | FurniturePlan }
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

function multiFloorBuildingInstruction(planUnits: z.infer<typeof PlanUnits>) {
  return `You are an architectural CAD vectorizer. You will receive MULTIPLE drawings of the SAME building, one per message part, each preceded by a text label such as "FLOOR 0 — ground (height 3.0 m)", "ROOF PLAN", "ELEVATION — North". Cross-read all of them and return ONE STRICT JSON describing every floor stacked bottom-up, plus the roof.

${PRINTED_UNITS_NOTE[planUnits]}

Return JSON ONLY in this exact shape:
{
  "kind": "multi_floor_building",
  "units": "meters",
  "bounds": { "width": <overall plan width m>, "length": <overall plan length m> },
  "floors": [
    {
      "index": 0,
      "label": "Ground floor",
      "heightMeters": <floor-to-floor height in m, taken from the user's per-floor value and cross-checked against the elevations>,
      "walls":    [ { "name": "...", "layer": "exterior"|"interior", "x1": <m>, "y1": <m>, "x2": <m>, "y2": <m>, "thickness": <m>, "height": <optional m>, "openings": [ { "kind": "door"|"window", "position": <m>, "width": <m>, "sillHeight": <m>, "headHeight": <m> } ] } ],
      "columns":  [ { "name": "...", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg> } ],
      "stairs":   [ { "name": "...", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "steps": <int>, "rotationDegZ": <deg> } ],
      "fixtures": [ { "name": "...", "layer": "kitchen"|"bath"|"furniture"|"appliance"|"plumbing"|"<other>", "cx": <m>, "cy": <m>, "cz": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg> } ]
    }
  ],
  "roof": { "kind": "flat"|"gable"|"hip"|"shed", "thicknessMeters": <m>, "overhangMeters": <m, optional>, "ridgeHeightMeters": <m above top floor's ceiling, only for gable/hip/shed>, "ridgeAxis": "x"|"y" }
}

Rules:
- Origin (0,0) at the bottom-left corner of the floor plan, +x right, +y up. Use the SAME origin and the SAME bounds for every floor and for the roof plan so the floors stack vertically aligned. If a floor plan is drawn at a different size, scale and align it to the ground floor's outline.
- Trace every exterior and interior wall on EACH floor as one straight segment between endpoints. Split walls at intersections. Put doors and windows in the wall's "openings" array — never split the wall at an opening.
- "position" is the distance from (x1,y1) along the wall to the START of the opening. Doors: sillHeight 0, headHeight ~2.1 m. Windows: sillHeight ~0.9 m, headHeight ~2.1 m. When the elevations show different sill/head heights, USE those — elevations are the ground truth for vertical positions.
- Use printed wall thicknesses when shown; otherwise 0.20 m exterior, 0.10 m interior.
- Use the elevations to confirm the total building height, floor-to-floor heights, parapet heights, and the roof shape (flat vs pitched). The "roof.kind" must match what the elevations show. For gable/hip/shed, set "ridgeHeightMeters" to the height of the ridge ABOVE the top floor's ceiling and "ridgeAxis" to the axis the ridge runs along.
- Output every floor in the "floors" array in physical stacking order, index 0 = ground floor.
- IGNORE MEP, door swings, dimension lines, text, hatching, north arrows, gridlines, title blocks.
- Be EXACT — geometry, locations and proportions must reproduce the drawings 1:1. Do not invent walls or openings that are not in the drawings, and do not omit any that are.

${ACCURACY_RULES}`;
}

function buildingReferenceRenderingInstruction() {
  return `You are an architectural 3D reconstruction modeler. Inspect the uploaded finished architectural rendering / reference image and return STRICT JSON describing a clean simplified 3D building or interior model that can be exported as Collada .dae.

REFERENCE RENDERING IS THE 100% FIDELITY SOURCE OF TRUTH — geometry, materials, textures and grouping:
- Reconstruct the visible walls, floor edges, columns, stairs, built-in fixtures, cabinetry and major furniture exactly as they appear in the rendering. Silhouette, count and arrangement of parts MUST match the image 1:1.
- MATERIALS: assign each element the material id whose visible finish most closely matches the rendering (wood tone, stone color, metal finish, glass, fabric). Put the descriptive finish from the rendering ("warm white oak", "Calacatta marble", "brushed brass", "smoked glass") in "materialNote".
- COLOR — MANDATORY: for EVERY element you output (walls, columns, stairs, fixtures) you MUST also include "colorHex": the EXACT sRGB hex (#RRGGBB) of the dominant visible surface color in the rendering for that element, sampled as if with an eyedropper at a representative lit (not shadowed, not blown-out highlight) area. This colour is rendered verbatim in the live 3D preview and the .dae export — it is how the model will look identical to the rendering. Do not invent a colour: pick what is actually in the pixels.
- GROUPING: every visually distinct material region in the rendering must be its OWN entry so it imports as its own .dae group/layer (separate "exterior" vs "interior" walls, separate kitchen vs bath vs furniture fixtures, separate stair from slab). Never merge two different materials into one entry.
- There may be NO printed dimensions. Infer realistic proportions from visible architectural scale and keep the model coherent.
- Do not output annotations, text, dimension marks, cameras, lights, background scenery, plants, people, loose decor, shadows or image-plane billboards.
- Use simple editable geometry: straight wall segments, rectangular columns, stairs, and fixture boxes. Each distinct visible element is its own entry.
- If only a single room / partial scene is visible, model only that visible room/scene.

Return JSON ONLY in this exact shape:
{
  "kind": "building",
  "units": "meters",
  "bounds": { "width": <estimated model width m>, "length": <estimated model length m> },
  "walls": [
    {
      "name": "<optional label>",
      "layer": "exterior" | "interior",
      "x1": <m>, "y1": <m>, "x2": <m>, "y2": <m>,
      "thickness": <m>,
      "height": <optional m>,
      "openings": [
        { "kind": "door"|"window", "position": <m from wall start>, "width": <m>, "sillHeight": <m>, "headHeight": <m> }
      ],
      "material": "stone_white"|"stone_dark"|"wood_oak"|"wood_walnut"|"wood_dark"|"metal_brass"|"metal_chrome"|"metal_black"|"fabric_neutral"|"leather_dark"|"glass"|"plastic_white"|"plastic_black"|"other",
      "materialNote": "<finish from the rendering, e.g. 'limewashed plaster', 'travertine'>",
      "colorHex": "#RRGGBB"
    }
  ],
  "columns": [ { "name": "<label>", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg>, "material": "<id>", "materialNote": "<finish>", "colorHex": "#RRGGBB" } ],
  "stairs":  [ { "name": "<label>", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "steps": <int>, "rotationDegZ": <deg>, "material": "<id>", "materialNote": "<finish>", "colorHex": "#RRGGBB" } ],
  "fixtures":[ { "name": "<label>", "layer": "kitchen"|"bath"|"furniture"|"appliance"|"plumbing"|"<other>", "cx": <m>, "cy": <m>, "cz": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg>, "material": "<id>", "materialNote": "<finish>", "colorHex": "#RRGGBB" } ]
}

Rules:
- Origin (0,0) at the lower-left of the reconstructed footprint, +x right, +y depth.
- Include at least the main visible wall envelope. Use typical wall thickness 0.12–0.25 m if unknown.
- Use realistic architectural scale: doors around 0.8–1.0 m wide and 2.1 m high, counters around 0.9 m high, rooms around 2.4–3.5 m high.
- EVERY element MUST carry both the "material" id (closest finish family) AND a sampled "colorHex" so the .dae imports with one selectable group per (material × colour) and the rendered colour matches the reference image exactly. Never default to "other" when a finish is clearly visible, and never omit "colorHex".
- Output JSON ONLY, no prose, no Markdown fences, parseable by JSON.parse.`;
}

function furnitureInstruction(planUnits: z.infer<typeof PlanUnits>) {
  return `You are a senior furniture modeler. You receive a technical sheet of ONE furniture piece that includes a TOP/PLAN view, FRONT view, SIDE view, printed dimensions, callouts, AND one or more REFERENCE PHOTOGRAPHS / 3D renderings of the finished piece. Return STRICT JSON describing the piece as a rich set of 3D shape PRIMITIVES (parts) that faithfully reproduce its REAL shape — including round columns, oval tops, ring footrests, tapered pedestals, base discs, bullnose edges, glides, etc.

REFERENCE IMAGE IS THE SOURCE OF TRUTH for SHAPE:
- If the sheet contains a photograph or 3D render of the actual piece, USE IT as the primary guide for the overall silhouette, proportions, and which parts exist (ring footrest, tapered column, disc base, edge band, etc.).
- Use the orthographic views (plan, front, side) and printed callouts for EXACT DIMENSIONS and positions.
- DO NOT output a simplified blocky stand-in. If the reference shows a round disc, a brass ring, a tapered pedestal, a bullnose edge, model each of those as its own primitive.

APPROVED RENDERING — 100% FIDELITY, ABSOLUTE PRIORITY:
If a SECOND image labelled "APPROVED RENDERING" is attached after the technical sheet (and a "Master prompt" text block is provided), it is the FINAL approved look of this piece. The 3D geometry — which drives BOTH the rotatable live preview AND the downloadable .dae file — MUST match the approved rendering with 100% fidelity:
- The silhouette, part count, part grouping, and overall proportions in the approved rendering are LAW. Do not add, remove, split, merge, or rearrange parts in any way that changes how the piece reads against that image from any rotation angle.
- Do NOT separate a single visually-continuous shape into multiple disjoint parts. If the approved rendering shows ONE flowing curved shell, model it as ONE primitive (or one tight group of primitives that read as one shell) — never break it into stacked boxes or a different topology.
- Do NOT invent a different shape (e.g. don't turn a curved organic top into a rectangle, don't turn a scalloped edge into a plain circle, don't turn a fluted column into a smooth one, don't turn a round disc into a square plate).
- Trace the approved render's OUTER CONTOUR first. For any visible silhouette that is not a simple box/circle/oval, use "custom_extrusion" and provide a normalized outline with enough points to match the render. This is mandatory for scallops, waves, arches, kidney/boomerang forms, freeform organic pieces and asymmetry.
- The MASTER PROMPT is BINDING. Re-read it before emitting JSON. Every UPPER-CASE feature in the master prompt (e.g. SCALLOPED BORDER, FLUTED PEDESTAL, REEDED FRONT, CURVED PLAN, CANTILEVERED TOP, BULLNOSE EDGE, SPLAYED LEGS, ASYMMETRIC SILHOUETTE) MUST be present in the geometry. Reproduce each one using the closest shape primitive(s) — repeat ellipse_cylinder/cylinder/rounded_box around the perimeter with the correct rotationDegZ when needed (e.g. an N-lobe scalloped border = N small cylinders arrayed around the rim with edgeRadius set).
- Match the approved rendering's proportions (top vs base diameter, column taper, ring height, edge thickness) within the printed dimensional constraints. Use the printed dimensions for exact numbers; use the rendering for shape choice.
- The approved rendering OVERRIDES any conflicting reading from the orthographic views; the orthographic views only supply exact numerical dimensions.
- The live rotatable 3D preview and the downloaded .dae are built directly from the JSON you return — there is no second pass. If you simplify here, the preview and file are wrong.

${PRINTED_UNITS_NOTE[planUnits]}

Return JSON ONLY in this exact shape:
{
  "kind": "furniture",
  "units": "meters",
  "bounds": { "width": <overall X m>, "depth": <overall Y m>, "height": <overall Z m> },
  "parts": [
    {
      "name": "<part name>",
      "shape": "box" | "cylinder" | "ellipse_cylinder" | "tapered_cylinder" | "torus" | "rounded_box" | "custom_extrusion",
      "cx": <m>, "cy": <m>, "cz": <m>,
      "width": <X m>, "depth": <Y m>, "height": <Z m>,
      "rotationDegZ": <deg>,
      "outline": [[<x>, <y>], ...],
      "topDiameter": <m, tapered_cylinder only — diameter at the TOP>,
      "tubeDiameter": <m, torus only — thickness of the ring>,
      "edgeRadius": <m, optional bullnose/fillet radius>,
      "material": "stone_white" | "stone_dark" | "wood_oak" | "wood_walnut" | "wood_dark" | "metal_brass" | "metal_chrome" | "metal_black" | "fabric_neutral" | "leather_dark" | "glass" | "plastic_white" | "plastic_black" | "other",
      "materialNote": "<optional free-text material description, e.g. 'Calacatta marble', 'white oak'>"
    }
  ]
}

MATERIALS — assign a "material" id to EVERY part using the visible finish/material in the drawing or reference photo:
  * stone_white      — white/cream marble or stone (e.g. Calacatta, Carrara, white quartz)
  * stone_dark       — dark stone (charcoal granite, soapstone, black marble)
  * wood_oak         — light/medium warm wood (white oak, ash, maple, light teak)
  * wood_walnut      — medium-dark brown wood (walnut, cherry, mahogany)
  * wood_dark        — very dark wood (ebony, blackened oak)
  * metal_brass      — brass / bronze / brushed gold
  * metal_chrome     — polished chrome / nickel / stainless steel
  * metal_black      — blackened / powder-coated black metal
  * fabric_neutral   — upholstery, linen, boucle
  * leather_dark     — leather, cognac/saddle
  * glass            — transparent glass
  * plastic_white / plastic_black — molded plastic
  * other            — only when nothing else fits
Include the spec/material code from the drawing (e.g. "ST-05", "WD-09", "MT-02") in "materialNote".

Shape primitive guide — pick the primitive that matches the PLAN view of that part:
  * "cylinder"          — plan view is a CIRCLE. width = depth = diameter.
  * "ellipse_cylinder"  — plan view is an ELLIPSE / OVAL. width = X diameter, depth = Y diameter.
  * "tapered_cylinder"  — round in plan, diameter changes from bottom to top (pedestal, tapered column). width = depth = BOTTOM diameter, topDiameter = TOP diameter.
  * "torus"             — RING in plan (e.g. brass footrest ring, metal hoop). width = depth = OUTER diameter, tubeDiameter = ring thickness, height ≈ tubeDiameter.
  * "rounded_box"       — rectangular in plan with rounded corners. edgeRadius = corner radius.
  * "custom_extrusion"  — REQUIRED for non-standard silhouettes that cannot be represented by the above primitives: SCALLOPED BORDER, PIE-CRUST EDGE, KIDNEY / BOOMERANG / ORGANIC PLAN, ASYMMETRIC SILHOUETTE, arched panels, wavy fronts, irregular live edges. Provide "outline" as 16–96 normalized [x,y] points, ordered around the plan-view perimeter, where [0,0] is the part center and -0.5..0.5 spans the full width/depth.
  * "box"               — only when the plan view is a true rectangle/square with sharp corners.
NEVER substitute a box for a round, oval, ring, tapered, scalloped, wavy, organic, kidney, boomerang, arched, or asymmetric part — that destroys the shape. If the approved rendering shows a unique outline, use custom_extrusion with enough outline points to match that outline.

Bullnose / chamfered / scalloped horizontal edges (e.g. "full bullnose edge profile", "1/8 in. scalloped reveal"):
- Model the part with the matching shape primitive (cylinder / ellipse_cylinder / rounded_box) at the correct overall diameter and thickness.
- Set "edgeRadius" to half the part's thickness for a full bullnose, or to the printed reveal/radius. We render this as a smooth top/bottom fillet so the edge reads as rounded.

Required decomposition (output every part that the piece actually has):
- Table / pedestal piece example: stone TOP (ellipse_cylinder), wood EDGE BAND beneath the stone (ellipse_cylinder), central COLUMN / pedestal (cylinder or tapered_cylinder), metal RING footrest (torus), wood BASE PLATE / disc (cylinder), GLIDES (small cylinders under the base).
- Chair example: seat, back, armrests, individual legs, stretchers, frame rails.
- Case piece example: top, sides, back, drawers, shelves, base, kickplate, pulls.

Rules:
- World axes: +X = piece width (left→right of the front view), +Y = piece depth (front→back), +Z = piece height (floor→top). Origin (0,0,0) at the bottom-front-left corner of the bounding box.
- (cx, cy, cz) is the CENTER of each part. (width, depth, height) are full extents along the local X/Y/Z BEFORE rotation. rotationDegZ rotates around the vertical Z axis, default 0.
- Read the PLAN view to set each part's footprint and shape. Read the FRONT and SIDE views (and printed callouts) for vertical position, height, and thickness. Use the REFERENCE PHOTOGRAPH to confirm silhouette, materials, and which parts exist.
- Capture EVERY distinct horizontal disc / oval / ring as its own part — e.g. stone top + wood edge band ⇒ two stacked ellipse_cylinders of matching X/Y diameter but different heights.
- Use printed overall width/depth/height for "bounds" and printed part dimensions for each primitive. Convert diameters correctly (e.g. 3" Ø ⇒ 0.0762 m).
- Use realistic typical thicknesses only when the drawing does not give them (e.g. 0.02 m panels, 0.05 m legs, 0.012 m metal ring tube).

${ACCURACY_RULES}`;
}

function furnitureReferenceRenderingInstruction() {
  return `You are a senior furniture 3D reconstruction modeler. Inspect the uploaded finished furniture rendering / reference image and return STRICT JSON describing the piece as editable 3D primitives for a live rotatable Collada .dae preview.

REFERENCE RENDERING IS THE 100% FIDELITY SOURCE OF TRUTH — geometry, materials, textures and grouping:
- The silhouette, part count, part grouping, proportions and material separation in the rendering are LAW. The reconstructed 3D piece must read identically to the rendering from any angle.
- MATERIALS / TEXTURES: every part MUST carry the "material" id whose visible finish most closely matches the rendering (stone_white, stone_dark, wood_oak, wood_walnut, wood_dark, metal_brass, metal_chrome, metal_black, fabric_neutral, leather_dark, glass, plastic_white, plastic_black, other). Describe the finish from the rendering ("Calacatta marble", "warm white oak", "brushed brass", "smoked glass") in "materialNote".
- COLOR — MANDATORY: every part MUST also include "colorHex": the EXACT sRGB hex (#RRGGBB) sampled from the rendering at a representative lit area of that part (not in shadow, not in a blown-out specular highlight). This colour is applied verbatim to the live 3D preview and the exported .dae so the model reads with the same shape, materials AND colours as the rendering. Never invent a colour and never omit this field.
- GROUPING: every visually distinct material region in the rendering is its OWN part so each material imports as its own selectable .dae group/layer (e.g. stone top + wood edge band + metal ring + wood base + brass glides = 5 parts, never merged). NEVER fuse two different materials/finishes into one part.
- Do NOT separate a single visually-continuous shape into multiple disjoint parts. If the rendering shows ONE flowing curved shell in ONE material, model it as ONE primitive (or one tight group of primitives that read as one shell).
- Trace the rendering's OUTER CONTOUR first. For any silhouette that is not a simple box/circle/oval, use "custom_extrusion" with 16–96 outline points that match the render's outline (scallops, waves, kidney, boomerang, asymmetry).
- There may be NO printed dimensions. Infer a realistic furniture scale (use the rendering's visible context: floor, surrounding objects, human-scale cues) and keep all parts proportionally coherent.
- Do NOT output a simplified blocky stand-in. Round, oval, ring, tapered, scalloped, arched, wavy or asymmetric features MUST use the closest matching primitive (cylinder / ellipse_cylinder / tapered_cylinder / torus / rounded_box / custom_extrusion) — never substitute a box.
- Do not output annotations, labels, dimension marks, cameras, lights, background scenery, shadows or image-plane billboards.

EDGE PROFILES — MANDATORY 1:1 WITH THE RENDERING:
- Inspect the edges of EVERY part in the reference rendering. If an edge looks rounded, softened, bullnosed, eased, chamfered, pillowed or radiused (even slightly), you MUST set "edgeRadius" on that part to the visible radius in meters (sampled from the rendering, e.g. 0.003 m for a hairline eased edge, 0.008 m for a typical softened edge, 0.012–0.02 m for a clear bullnose, half the part's thickness for a FULL bullnose).
- For rectangular parts with rounded corners in PLAN (e.g. a soft-cornered tabletop, cushion, plinth) use "rounded_box" and set BOTH the corner radius (via the plan view) AND "edgeRadius" for the top/bottom horizontal edge fillet. The .dae export turns "edgeRadius" into a real fillet on the top and bottom of the extrusion, so omitting it produces a wrong sharp-edged piece.
- For "custom_extrusion" silhouettes, "edgeRadius" produces the same top/bottom fillet — set it whenever the rendering shows a non-sharp top/bottom edge.
- Default to a small "edgeRadius" of 0.002–0.005 m on any furniture surface that is clearly not knife-sharp in the rendering. Only set 0 / omit it when the edge is unambiguously a hard 90° corner.

Return JSON ONLY in this exact shape:
{
  "kind": "furniture",
  "units": "meters",
  "bounds": { "width": <estimated overall X m>, "depth": <estimated overall Y m>, "height": <estimated overall Z m> },
  "parts": [
    {
      "name": "<part name>",
      "shape": "box" | "cylinder" | "ellipse_cylinder" | "tapered_cylinder" | "torus" | "rounded_box" | "custom_extrusion",
      "cx": <m>, "cy": <m>, "cz": <m>,
      "width": <m>, "depth": <m>, "height": <m>,
      "rotationDegZ": <deg>,
      "outline": [[<x>, <y>], ...],
      "topDiameter": <m>,
      "tubeDiameter": <m>,
      "edgeRadius": <m>,
      "material": "stone_white" | "stone_dark" | "wood_oak" | "wood_walnut" | "wood_dark" | "metal_brass" | "metal_chrome" | "metal_black" | "fabric_neutral" | "leather_dark" | "glass" | "plastic_white" | "plastic_black" | "other",
      "materialNote": "<optional finish description>",
      "colorHex": "#RRGGBB"
    }
  ]
}

Shape rules:
- Use cylinder / ellipse_cylinder / tapered_cylinder / torus for round or ring parts.
- Use rounded_box for softened rectangular forms.
- Use custom_extrusion with 16–96 outline points for scalloped, kidney, boomerang, organic, arched, wavy or asymmetric silhouettes.
- Origin (0,0,0) at the bottom-front-left of the bounding box; +Z is height.
- Include every visually distinct major part so materials import as separate editable groups.
- Output JSON ONLY, no prose, no Markdown fences, parseable by JSON.parse.`;
}

function scallopedOutline(points = 96, lobes = 16): Array<[number, number]> {
  return Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const r = 0.455 + 0.045 * Math.cos(lobes * a);
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

function organicOutline(points = 72): Array<[number, number]> {
  return Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const r = 0.42 + 0.055 * Math.sin(a) - 0.045 * Math.cos(2 * a) + 0.025 * Math.sin(3 * a);
    return [Math.cos(a) * r + 0.035 * Math.sin(a), Math.sin(a) * r];
  });
}

function enforcePromptShapeTraits(plan: FurniturePlan, masterPrompt?: string, approvedRenderUrl?: string): FurniturePlan {
  if (!approvedRenderUrl || !masterPrompt || plan.parts.some((part) => part.shape === "custom_extrusion")) return plan;
  const prompt = masterPrompt.toUpperCase();
  const needsScallop = /SCALLOP|PIE-CRUST/.test(prompt);
  const needsOrganic = /KIDNEY|BOOMERANG|ORGANIC|BIOMORPHIC|ASYMMETRIC|WAVY|LIVE EDGE|CURVED PLAN/.test(prompt);
  if (!needsScallop && !needsOrganic) return plan;
  let targetIndex = -1;
  let targetScore = -Infinity;
  plan.parts.forEach((part, index) => {
    const score = part.width * part.depth * (1 + part.cz / Math.max(plan.bounds.height, 0.001));
    if (score > targetScore) { targetScore = score; targetIndex = index; }
  });
  if (targetIndex < 0) return plan;
  return {
    ...plan,
    parts: plan.parts.map((part, index) => index === targetIndex ? {
      ...part,
      shape: "custom_extrusion" as const,
      outline: needsScallop ? scallopedOutline() : organicOutline(),
      edgeRadius: part.edgeRadius ?? Math.min(part.height / 2, 0.025),
    } : part),
  };
}

type Group = {
  id: string;
  name: string;
  positions: number[];
  indices: number[];
  materialId: MaterialId;
  // Per-element sRGB colour sampled from the reference rendering. When set,
  // this overrides the palette colour in both the .dae export and any client
  // that reads the .dae effects (the live preview loads the .dae).
  colorOverride?: [number, number, number];
  // Hierarchical scene-graph path for the .dae <visual_scene>. Each entry
  // becomes a parent <node>, so SketchUp / Blender / 3ds Max import the model
  // with a clean group tree: e.g. ["Floor 01 — Ground", "Walls / Exterior"].
  // When omitted the group sits at the scene root (backward compatible).
  parentPath?: string[];
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseHexColor(hex?: string): [number, number, number] | undefined {
  if (!hex) return undefined;
  const clean = hex.replace(/^#/, "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return undefined;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function makeGroupBuilder(
  id: string,
  name: string,
  scale: number,
  materialId: MaterialId = "other",
  colorOverride?: [number, number, number],
): {
  group: Group;
  addCorners: (corners: [number, number, number][]) => void;
  addBox: (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number) => void;
} {
  const group: Group = { id, name, positions: [], indices: [], materialId, colorOverride };
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

function addEllipticalCylinder(
  group: Group,
  cx: number, cy: number, cz: number,
  diameterX: number, diameterY: number, height: number,
  rotationDegZ: number,
  scale: number,
  segments = 64,
) {
  const rx = diameterX / 2, ry = diameterY / 2, hz = height / 2;
  const theta = (rotationDegZ * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const base = group.positions.length / 3;
  // Ring vertices: 0..segments-1 = bottom ring, segments..2*segments-1 = top ring
  for (let level = 0; level < 2; level++) {
    const z = level === 0 ? -hz : hz;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const lx = Math.cos(a) * rx;
      const ly = Math.sin(a) * ry;
      const wx = cx + lx * cos - ly * sin;
      const wy = cy + lx * sin + ly * cos;
      group.positions.push(wx * scale, wy * scale, (cz + z) * scale);
    }
  }
  const bottomCenter = base + segments * 2;
  const topCenter = bottomCenter + 1;
  group.positions.push(cx * scale, cy * scale, (cz - hz) * scale);
  group.positions.push(cx * scale, cy * scale, (cz + hz) * scale);
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const b0 = base + i, b1 = base + next;
    const t0 = base + segments + i, t1 = base + segments + next;
    // Side quad (two triangles, CCW from outside)
    group.indices.push(b0, b1, t1, b0, t1, t0);
    // Bottom cap (face down)
    group.indices.push(bottomCenter, b1, b0);
    // Top cap (face up)
    group.indices.push(topCenter, t0, t1);
  }
}

function addBullnoseCylinder(
  group: Group,
  cx: number, cy: number, cz: number,
  diameterX: number, diameterY: number, height: number,
  rotationDegZ: number,
  scale: number,
  edgeRadius: number,
  segments = 64,
  rings = 6,
) {
  // Stack rings: bottom fillet (rings) + cylinder middle + top fillet (rings).
  // The fillet radius is clamped so it never exceeds half the height or half the smaller diameter.
  const r = Math.max(0, Math.min(edgeRadius, height / 2, Math.min(diameterX, diameterY) / 2));
  if (r <= 0.0005) {
    addEllipticalCylinder(group, cx, cy, cz, diameterX, diameterY, height, rotationDegZ, scale, segments);
    return;
  }
  const rx = diameterX / 2, ry = diameterY / 2, hz = height / 2;
  const theta = (rotationDegZ * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const base = group.positions.length / 3;

  // Build profile rings from bottom to top.
  const profile: Array<{ scale: number; z: number }> = [];
  // Bottom fillet quarter circle: from z=0 angle -90° up to z=r angle 0°.
  for (let i = 0; i <= rings; i++) {
    const a = -Math.PI / 2 + (i / rings) * (Math.PI / 2);
    const inset = r - r * Math.cos(a); // 0 at top of fillet, r at bottom
    const dz = r + r * Math.sin(a);    // 0 at bottom, r at top of fillet
    profile.push({ scale: (1 - inset / Math.max(rx, ry)), z: -hz + dz });
  }
  // Straight middle (just two anchors at fillet tops).
  profile.push({ scale: 1, z: hz - r });
  // Top fillet quarter circle: 0° to 90°.
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * (Math.PI / 2);
    const inset = r - r * Math.cos(a);
    const dz = r * Math.sin(a);
    profile.push({ scale: (1 - inset / Math.max(rx, ry)), z: hz - r + dz });
  }

  for (const ring of profile) {
    const erx = rx * ring.scale;
    const ery = ry * ring.scale;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const lx = Math.cos(a) * erx;
      const ly = Math.sin(a) * ery;
      const wx = cx + lx * cos - ly * sin;
      const wy = cy + lx * sin + ly * cos;
      group.positions.push(wx * scale, wy * scale, (cz + ring.z) * scale);
    }
  }
  const bottomCenter = base + profile.length * segments;
  const topCenter = bottomCenter + 1;
  group.positions.push(cx * scale, cy * scale, (cz - hz) * scale);
  group.positions.push(cx * scale, cy * scale, (cz + hz) * scale);
  for (let ringIndex = 0; ringIndex < profile.length - 1; ringIndex++) {
    const r0 = base + ringIndex * segments;
    const r1 = base + (ringIndex + 1) * segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      group.indices.push(r0 + i, r0 + next, r1 + next, r0 + i, r1 + next, r1 + i);
    }
  }
  // Caps using innermost rings (top of bottom fillet and bottom of top fillet collapse to center).
  const firstRing = base;
  const lastRing = base + (profile.length - 1) * segments;
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    group.indices.push(bottomCenter, firstRing + next, firstRing + i);
    group.indices.push(topCenter, lastRing + i, lastRing + next);
  }
}

function addTaperedCylinder(
  group: Group,
  cx: number, cy: number, cz: number,
  bottomDiameter: number, topDiameter: number, height: number,
  rotationDegZ: number,
  scale: number,
  segments = 64,
) {
  const rb = bottomDiameter / 2, rt = topDiameter / 2, hz = height / 2;
  const theta = (rotationDegZ * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const base = group.positions.length / 3;
  for (let level = 0; level < 2; level++) {
    const r = level === 0 ? rb : rt;
    const z = level === 0 ? -hz : hz;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const lx = Math.cos(a) * r, ly = Math.sin(a) * r;
      const wx = cx + lx * cos - ly * sin;
      const wy = cy + lx * sin + ly * cos;
      group.positions.push(wx * scale, wy * scale, (cz + z) * scale);
    }
  }
  const bottomCenter = base + segments * 2;
  const topCenter = bottomCenter + 1;
  group.positions.push(cx * scale, cy * scale, (cz - hz) * scale);
  group.positions.push(cx * scale, cy * scale, (cz + hz) * scale);
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    const b0 = base + i, b1 = base + next;
    const t0 = base + segments + i, t1 = base + segments + next;
    group.indices.push(b0, b1, t1, b0, t1, t0);
    if (rb > 0.0005) group.indices.push(bottomCenter, b1, b0);
    if (rt > 0.0005) group.indices.push(topCenter, t0, t1);
  }
}

function addTorus(
  group: Group,
  cx: number, cy: number, cz: number,
  outerDiameterX: number, outerDiameterY: number,
  tubeDiameter: number,
  rotationDegZ: number,
  scale: number,
  majorSegments = 64,
  minorSegments = 16,
) {
  const tubeR = tubeDiameter / 2;
  const Rx = Math.max(outerDiameterX / 2 - tubeR, tubeR);
  const Ry = Math.max(outerDiameterY / 2 - tubeR, tubeR);
  const theta = (rotationDegZ * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const base = group.positions.length / 3;
  for (let i = 0; i < majorSegments; i++) {
    const u = (i / majorSegments) * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j < minorSegments; j++) {
      const v = (j / minorSegments) * Math.PI * 2;
      const cv = Math.cos(v), sv = Math.sin(v);
      const lx = (Rx + tubeR * cv) * cu;
      const ly = (Ry + tubeR * cv) * su;
      const lz = tubeR * sv;
      const wx = cx + lx * cos - ly * sin;
      const wy = cy + lx * sin + ly * cos;
      group.positions.push(wx * scale, wy * scale, (cz + lz) * scale);
    }
  }
  for (let i = 0; i < majorSegments; i++) {
    const iNext = (i + 1) % majorSegments;
    for (let j = 0; j < minorSegments; j++) {
      const jNext = (j + 1) % minorSegments;
      const a = base + i * minorSegments + j;
      const b = base + iNext * minorSegments + j;
      const c = base + iNext * minorSegments + jNext;
      const d = base + i * minorSegments + jNext;
      group.indices.push(a, b, c, a, c, d);
    }
  }
}

function addRoundedBox(
  group: Group,
  cx: number, cy: number, cz: number,
  width: number, depth: number, height: number,
  rotationDegZ: number,
  scale: number,
  cornerRadius: number,
  cornerSegments = 8,
  edgeRadius = 0,
) {
  const r = Math.max(0, Math.min(cornerRadius, width / 2, depth / 2));
  if (r <= 0.0005) {
    const hx = width / 2, hy = depth / 2, hz = height / 2;
    const theta = (rotationDegZ * Math.PI) / 180;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const corners: [number, number, number][] = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
    ].map(([x, y, z]) => [cx + x * cos - y * sin, cy + x * sin + y * cos, cz + z]);
    const baseIdx = group.positions.length / 3;
    for (const [x, y, z] of corners) group.positions.push(x * scale, y * scale, z * scale);
    const faces: [number, number, number, number][] = [
      [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0],
    ];
    for (const [a, b, c, d] of faces) {
      group.indices.push(baseIdx + a, baseIdx + b, baseIdx + c, baseIdx + a, baseIdx + c, baseIdx + d);
    }
    return;
  }
  const hx = width / 2, hy = depth / 2, hz = height / 2;
  // Build a stadium-style outline (rectangle with rounded corners) and extrude.
  const outline: [number, number][] = [];
  const corners: Array<{ cx: number; cy: number; start: number }> = [
    { cx: hx - r, cy: hy - r, start: 0 },
    { cx: -hx + r, cy: hy - r, start: Math.PI / 2 },
    { cx: -hx + r, cy: -hy + r, start: Math.PI },
    { cx: hx - r, cy: -hy + r, start: (3 * Math.PI) / 2 },
  ];
  for (const c of corners) {
    for (let i = 0; i <= cornerSegments; i++) {
      const a = c.start + (i / cornerSegments) * (Math.PI / 2);
      outline.push([c.cx + Math.cos(a) * r, c.cy + Math.sin(a) * r]);
    }
  }
  addFilletedExtrusion(group, outline, cx, cy, cz, height, edgeRadius, rotationDegZ, scale);
  void hx; void hy; void hz;
}

function addCustomExtrusion(
  group: Group,
  part: z.infer<typeof PartSchema>,
  scale: number,
) {
  const outline = part.outline?.length ? part.outline : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const localOutline: [number, number][] = outline.map(([nx, ny]) => [nx * part.width, ny * part.depth]);
  addFilletedExtrusion(
    group,
    localOutline,
    part.cx, part.cy, part.cz,
    part.height,
    part.edgeRadius ?? 0,
    part.rotationDegZ,
    scale,
  );
}

/**
 * Inward polygon offset (miter join) for a CCW outline in part-local
 * coordinates. Used to build a true bullnose / fillet on the top and bottom
 * of any extruded shape so the .dae output matches softened edges that are
 * visible in the reference rendering instead of producing sharp 90° edges.
 */
function offsetPolygonInward(outline: [number, number][], inset: number): [number, number][] {
  const n = outline.length;
  if (inset <= 0 || n < 3) return outline.map(([x, y]) => [x, y]);
  return outline.map((p, i) => {
    const prev = outline[(i - 1 + n) % n];
    const next = outline[(i + 1) % n];
    const e1x = p[0] - prev[0], e1y = p[1] - prev[1];
    const e2x = next[0] - p[0], e2y = next[1] - p[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    const n1x = -e1y / l1, n1y = e1x / l1;
    const n2x = -e2y / l2, n2y = e2x / l2;
    let bx = n1x + n2x, by = n1y + n2y;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl; by /= bl;
    const cosHalf = Math.max(0.25, n1x * bx + n1y * by);
    const m = inset / cosHalf;
    return [p[0] + bx * m, p[1] + by * m];
  });
}

/**
 * Extrude a 2D outline along Z with optional top/bottom fillets so that
 * rectangular tops, plinths, slab edges and custom silhouettes render the
 * SAME softened edge profile that the user sees in the approved rendering.
 */
function addFilletedExtrusion(
  group: Group,
  outlineLocal: [number, number][],
  cx: number, cy: number, cz: number,
  height: number,
  edgeRadius: number,
  rotationDegZ: number,
  scale: number,
  rings = 5,
) {
  const n = outlineLocal.length;
  if (n < 3) return;
  const hz = height / 2;
  const theta = (rotationDegZ * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const r = Math.max(0, Math.min(edgeRadius, height / 2));

  const ringDefs: Array<{ inset: number; z: number }> = [];
  if (r > 0.0005) {
    for (let i = 0; i <= rings; i++) {
      const a = -Math.PI / 2 + (i / rings) * (Math.PI / 2);
      ringDefs.push({ inset: r - r * Math.cos(a), z: -hz + (r + r * Math.sin(a)) });
    }
    ringDefs.push({ inset: 0, z: hz - r });
    for (let i = 0; i <= rings; i++) {
      const a = (i / rings) * (Math.PI / 2);
      ringDefs.push({ inset: r - r * Math.cos(a), z: hz - r + r * Math.sin(a) });
    }
  } else {
    ringDefs.push({ inset: 0, z: -hz });
    ringDefs.push({ inset: 0, z: hz });
  }

  const base = group.positions.length / 3;
  for (const ring of ringDefs) {
    const ringOutline = ring.inset > 0 ? offsetPolygonInward(outlineLocal, ring.inset) : outlineLocal;
    for (const [lx, ly] of ringOutline) {
      const wx = cx + lx * cos - ly * sin;
      const wy = cy + lx * sin + ly * cos;
      group.positions.push(wx * scale, wy * scale, (cz + ring.z) * scale);
    }
  }
  for (let ri = 0; ri < ringDefs.length - 1; ri++) {
    const r0 = base + ri * n;
    const r1 = base + (ri + 1) * n;
    for (let i = 0; i < n; i++) {
      const nx = (i + 1) % n;
      group.indices.push(r0 + i, r0 + nx, r1 + nx, r0 + i, r1 + nx, r1 + i);
    }
  }
  const first = base;
  const last = base + (ringDefs.length - 1) * n;
  for (let i = 1; i < n - 1; i++) {
    group.indices.push(first, first + i + 1, first + i);
    group.indices.push(last, last + i, last + i + 1);
  }
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

    // Ceiling slab — full footprint, sitting on top of the default wall
    // height. Becomes its own selectable layer ("Ceiling") on .dae import.
    const ceiling = makeGroupBuilder("group_ceiling", "Ceiling", scale, "plaster_white");
    ceiling.addBox(0, 0, wallHeightMeters, plan.bounds.width, plan.bounds.length, wallHeightMeters + 0.08);
    groups.push(ceiling.group);

    // Group by (category, material) so each visually distinct material region
    // in the rendering becomes its own selectable .dae layer.
    const bucketFor = (
      cache: Map<string, ReturnType<typeof makeGroupBuilder>>,
      key: string,
      label: string,
      matId: MaterialId,
      colorHex?: string,
    ) => {
      const color = parseHexColor(colorHex);
      const colorKey = color ? `_${color.map((c) => Math.round(c * 255)).join("-")}` : "";
      const full = `${key}__${matId}${colorKey}`;
      let b = cache.get(full);
      if (!b) {
        const matLabel = MATERIAL_PALETTE[matId]?.label ?? matId;
        const safe = full.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
        const niceLabel = colorHex ? `${label} — ${matLabel} (${colorHex.startsWith("#") ? colorHex : `#${colorHex}`})` : `${label} — ${matLabel}`;
        b = makeGroupBuilder(`group_${safe}`, niceLabel, scale, matId, color);
        cache.set(full, b);
      }
      return b;
    };

    const wallBuckets = new Map<string, ReturnType<typeof makeGroupBuilder>>();
    for (const wall of plan.walls) {
      const label = wall.layer === "exterior" ? "Walls - Exterior" : "Walls - Interior";
      const b = bucketFor(wallBuckets, `walls_${wall.layer}`, label, wall.material, wall.colorHex);
      addWallWithOpenings(b.addCorners, wall, wallHeightMeters);
    }
    for (const b of wallBuckets.values()) groups.push(b.group);

    // Doors and windows — every wall opening becomes a real 3D element so
    // the .dae shows actual door leaves and glass panes inside the holes
    // the wall geometry cut out (instead of empty rectangles).
    const doorBucket = makeGroupBuilder("group_doors", "Doors", scale, "wood_oak");
    const windowGlass = makeGroupBuilder("group_window_glass", "Windows - Glass", scale, "glass_clear");
    const windowFrame = makeGroupBuilder("group_window_frames", "Windows - Frames", scale, "metal_aluminum_brushed");
    for (const wall of plan.walls) {
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      const ux = dx / len, uy = dy / len;
      const top = wall.height ?? wallHeightMeters;
      const angleDeg = (Math.atan2(uy, ux) * 180) / Math.PI;
      for (const op of wall.openings) {
        const start = Math.max(0, Math.min(len, op.position));
        const end = Math.max(0, Math.min(len, op.position + op.width));
        const wOp = end - start;
        if (wOp < 0.05) continue;
        const sill = Math.max(0, Math.min(top, op.sillHeight));
        const head = Math.max(sill + 0.05, Math.min(top, op.headHeight));
        const hOp = head - sill;
        const midAlong = (start + end) / 2;
        const cx = wall.x1 + ux * midAlong;
        const cy = wall.y1 + uy * midAlong;
        if (op.kind === "door") {
          // Door leaf: 4 cm thick panel filling the opening, sitting inside the wall.
          const thickness = Math.min(0.04, wall.thickness * 0.4);
          addRotatedBox(doorBucket.addCorners, cx, cy, sill + hOp / 2, wOp - 0.02, thickness, hOp - 0.02, angleDeg);
        } else {
          // Window: thin glass pane centered in wall, with a slim frame around it.
          const glassThickness = Math.min(0.02, wall.thickness * 0.25);
          const frameDepth = Math.min(0.05, wall.thickness * 0.5);
          const frameWidth = 0.05;
          // Glass pane (inset by frame width on all sides)
          const gW = Math.max(0.05, wOp - 2 * frameWidth);
          const gH = Math.max(0.05, hOp - 2 * frameWidth);
          addRotatedBox(windowGlass.addCorners, cx, cy, sill + hOp / 2, gW, glassThickness, gH, angleDeg);
          // Frame: 4 thin bars (top, bottom, left, right) — drawn as boxes in wall plane
          // Bottom rail
          addRotatedBox(windowFrame.addCorners, cx, cy, sill + frameWidth / 2, wOp, frameDepth, frameWidth, angleDeg);
          // Top rail
          addRotatedBox(windowFrame.addCorners, cx, cy, head - frameWidth / 2, wOp, frameDepth, frameWidth, angleDeg);
          // Side stiles — offset along the wall direction
          const stileOffset = (wOp - frameWidth) / 2;
          const lx = cx - ux * stileOffset, ly = cy - uy * stileOffset;
          const rx = cx + ux * stileOffset, ry = cy + uy * stileOffset;
          addRotatedBox(windowFrame.addCorners, lx, ly, sill + hOp / 2, frameWidth, frameDepth, hOp, angleDeg);
          addRotatedBox(windowFrame.addCorners, rx, ry, sill + hOp / 2, frameWidth, frameDepth, hOp, angleDeg);
        }
      }
    }
    if (doorBucket.group.positions.length) groups.push(doorBucket.group);
    if (windowGlass.group.positions.length) groups.push(windowGlass.group);
    if (windowFrame.group.positions.length) groups.push(windowFrame.group);

    if (plan.columns.length) {
      const cache = new Map<string, ReturnType<typeof makeGroupBuilder>>();
      for (const c of plan.columns) {
        const b = bucketFor(cache, "columns", "Columns", c.material, c.colorHex);
        addRotatedBox(b.addCorners, c.cx, c.cy, c.height / 2, c.width, c.depth, c.height, c.rotationDegZ);
      }
      for (const b of cache.values()) groups.push(b.group);
    }
    if (plan.stairs.length) {
      const cache = new Map<string, ReturnType<typeof makeGroupBuilder>>();
      for (const s of plan.stairs) {
        const g = bucketFor(cache, "stairs", "Stairs", s.material, s.colorHex);
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
      for (const b of cache.values()) groups.push(b.group);
    }
    if (plan.fixtures.length) {
      const cache = new Map<string, ReturnType<typeof makeGroupBuilder>>();
      for (const f of plan.fixtures) {
        const layerKey = (f.layer || "fixtures").trim().toLowerCase() || "fixtures";
        const b = bucketFor(cache, `fixtures_${layerKey}`, `Fixtures - ${layerKey}`, f.material, f.colorHex);
        addRotatedBox(b.addCorners, f.cx, f.cy, f.cz, f.width, f.depth, f.height, f.rotationDegZ);
      }
      for (const b of cache.values()) groups.push(b.group);
    }
  } else {
    // Group furniture parts by MATERIAL so each material becomes its own
    // selectable layer on .dae import (Stone — White, Wood — Oak, Metal —
    // Brass, …).
    const byMaterial = new Map<string, ReturnType<typeof makeGroupBuilder>>();
    plan.parts.forEach((part) => {
      const matId = part.material;
      const color = parseHexColor(part.colorHex);
      const colorKey = color ? `_${color.map((c) => Math.round(c * 255)).join("-")}` : "";
      const bucketKey = `${matId}${colorKey}`;
      let bucket = byMaterial.get(bucketKey);
      if (!bucket) {
        const spec = MATERIAL_PALETTE[matId];
        const label = part.colorHex ? `${spec.label} (${part.colorHex.startsWith("#") ? part.colorHex : `#${part.colorHex}`})` : spec.label;
        bucket = makeGroupBuilder(`group_mat_${bucketKey}`, label, scale, matId, color);
        byMaterial.set(bucketKey, bucket);
      }
      const g = bucket;
      const dx = part.width;
      const dy = part.shape === "cylinder" || part.shape === "tapered_cylinder" ? part.width : part.depth;
      const edge = part.edgeRadius ?? 0;
      if (part.shape === "cylinder" || part.shape === "ellipse_cylinder") {
        if (edge > 0.0005) addBullnoseCylinder(g.group, part.cx, part.cy, part.cz, dx, dy, part.height, part.rotationDegZ, scale, edge);
        else addEllipticalCylinder(g.group, part.cx, part.cy, part.cz, dx, dy, part.height, part.rotationDegZ, scale, 64);
      } else if (part.shape === "tapered_cylinder") {
        const top = part.topDiameter ?? part.width * 0.6;
        addTaperedCylinder(g.group, part.cx, part.cy, part.cz, dx, top, part.height, part.rotationDegZ, scale, 64);
      } else if (part.shape === "torus") {
        const tube = part.tubeDiameter ?? Math.min(part.height, 0.015);
        addTorus(g.group, part.cx, part.cy, part.cz, dx, dy, tube, part.rotationDegZ, scale, 64, 16);
      } else if (part.shape === "rounded_box") {
        addRoundedBox(
          g.group,
          part.cx, part.cy, part.cz,
          part.width, part.depth, part.height,
          part.rotationDegZ, scale,
          edge || 0.01,
          8,
          edge || Math.min(0.01, part.height / 2),
        );
      } else if (part.shape === "custom_extrusion") {
        addCustomExtrusion(g.group, part, scale);
      } else {
        // Sharp box. If the AI tagged a non-zero edgeRadius (e.g. softened
        // tabletop edge visible in the rendering), promote it to a filleted
        // extrusion so the .dae has the same rounded edge profile.
        if (edge > 0.0005) {
          const hx = part.width / 2, hy = part.depth / 2;
          const rect: [number, number][] = [
            [-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy],
          ];
          addFilletedExtrusion(g.group, rect, part.cx, part.cy, part.cz, part.height, edge, part.rotationDegZ, scale);
        } else {
          addRotatedBox(g.addCorners, part.cx, part.cy, part.cz, part.width, part.depth, part.height, part.rotationDegZ);
        }
      }
    });
    for (const bucket of byMaterial.values()) groups.push(bucket.group);
  }

  return groups.filter((g) => g.positions.length > 0);
}

function buildDae(
  plan: BuildingPlan | FurniturePlan,
  wallHeightMeters: number,
  outputUnits: "meters" | "feet",
) {
  const groups = buildGroups(plan, wallHeightMeters, outputUnits);
  return emitDaeFromGroups(groups, outputUnits);
}

function buildMultiFloorBuildingDae(
  multi: MultiFloorBuildingPlan,
  outputUnits: "meters" | "feet",
): { dae: string; elementCount: number } {
  const scale = outputUnits === "feet" ? 1 / 0.3048 : 1;
  const allGroups: Group[] = [];
  let elementCount = 0;

  // Ground slab
  const ground = makeGroupBuilder("group_slab_ground", "Ground slab", scale, "concrete_polished");
  ground.addBox(0, 0, -0.2, multi.bounds.width, multi.bounds.length, 0);
  allGroups.push(ground.group);

  // Sort floors by index, ground → top
  const sortedFloors = [...multi.floors].sort((a, b) => a.index - b.index);

  let zOffset = 0;
  for (let i = 0; i < sortedFloors.length; i++) {
    const floor = sortedFloors[i];
    const subPlan: BuildingPlan = {
      kind: "building",
      units: "meters",
      bounds: multi.bounds,
      walls: floor.walls,
      columns: floor.columns,
      stairs: floor.stairs,
      fixtures: floor.fixtures,
    };
    const floorGroups = buildGroups(subPlan, floor.heightMeters, outputUnits)
      // strip the per-floor slab and ceiling — multi-floor adds them explicitly
      .filter((g) => g.id !== "group_slab" && g.id !== "group_ceiling");
    const dzScaled = zOffset * scale;
    const label = floor.label?.trim() || `Floor ${floor.index}`;
    for (const g of floorGroups) {
      for (let p = 2; p < g.positions.length; p += 3) g.positions[p] += dzScaled;
      g.id = `f${floor.index}_${g.id}`;
      g.name = `${label} — ${g.name}`;
      allGroups.push(g);
    }
    elementCount += floor.walls.length + floor.columns.length + floor.stairs.length + floor.fixtures.length;

    zOffset += floor.heightMeters;

    // Inter-floor slab (acts as ceiling of below + floor of above).
    // The roof above replaces the slab on top.
    const isTop = i === sortedFloors.length - 1;
    if (!isTop) {
      const slab = makeGroupBuilder(
        `group_slab_between_${floor.index}_${floor.index + 1}`,
        `Slab — between ${label} and floor ${floor.index + 1}`,
        scale,
        "concrete_polished",
      );
      slab.addBox(0, 0, zOffset - 0.12, multi.bounds.width, multi.bounds.length, zOffset);
      allGroups.push(slab.group);
    }
  }

  // Roof — v1 always renders a flat slab with optional overhang and thickness.
  // Pitched roof kinds are captured in the JSON for future use but currently
  // assembled as a flat slab to keep geometry predictable.
  const roof = multi.roof ?? { kind: "flat" as const, thicknessMeters: 0.2 };
  const overhang = roof.overhangMeters ?? 0;
  const roofSlab = makeGroupBuilder(
    "group_roof",
    `Roof — ${roof.kind}`,
    scale,
    "concrete_polished",
  );
  roofSlab.addBox(
    -overhang,
    -overhang,
    zOffset,
    multi.bounds.width + overhang,
    multi.bounds.length + overhang,
    zOffset + roof.thicknessMeters,
  );
  allGroups.push(roofSlab.group);

  return { dae: emitDaeFromGroups(allGroups, outputUnits), elementCount };
}

function emitDaeFromGroups(groups: Group[], outputUnits: "meters" | "feet") {
  const created = new Date().toISOString();
  const unitTag = outputUnits === "feet"
    ? '<unit name="foot" meter="0.3048"/>'
    : '<unit name="meter" meter="1"/>';

  // Emit one <effect> + <material> per GROUP so per-element colour overrides
  // sampled from the reference rendering survive the export. Groups that share
  // a material id + colour will reuse the same effect.
  const matSymbol = (gid: string) => `${gid}_mat_sg`;
  const matIdOf = (gid: string) => `${gid}_mat`;
  const matEffectId = (gid: string) => `${gid}_mat_fx`;

  const effectsXml = groups.map((g) => {
    const spec = MATERIAL_PALETTE[g.materialId];
    const [r, gr, b] = g.colorOverride ?? spec.color;
    const transparency = spec.transmission && spec.transmission > 0 ? 1 - spec.transmission : 1;
    return `    <effect id="${matEffectId(g.id)}"><profile_COMMON><technique sid="common"><lambert>
      <diffuse><color>${r.toFixed(3)} ${gr.toFixed(3)} ${b.toFixed(3)} ${transparency.toFixed(3)}</color></diffuse>
      <transparency><float>${transparency.toFixed(3)}</float></transparency>
    </lambert></technique></profile_COMMON></effect>`;
  }).join("\n");

  const materialsXml = groups.map((g) => {
    return `    <material id="${matIdOf(g.id)}" name="${escapeXml(g.name)}"><instance_effect url="#${matEffectId(g.id)}"/></material>`;
  }).join("\n");

  const geometriesXml = groups.map((g) => {
    const positionText = g.positions.map((n) => n.toFixed(4)).join(" ");
    const triCount = g.indices.length / 3;
    const pIndex = g.indices.join(" ");
    const sym = matSymbol(g.id);
    return `    <geometry id="${g.id}_geom" name="${escapeXml(g.name)}">
      <mesh>
        <source id="${g.id}_pos">
          <float_array id="${g.id}_pos_array" count="${g.positions.length}">${positionText}</float_array>
          <technique_common><accessor source="#${g.id}_pos_array" count="${g.positions.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common>
        </source>
        <vertices id="${g.id}_vtx"><input semantic="POSITION" source="#${g.id}_pos"/></vertices>
        <triangles material="${sym}" count="${triCount}">
          <input semantic="VERTEX" source="#${g.id}_vtx" offset="0"/>
          <p>${pIndex}</p>
        </triangles>
      </mesh>
    </geometry>`;
  }).join("\n");

  const nodesXml = groups.map((g) => {
    const sym = matSymbol(g.id);
    return `      <node id="${g.id}_node" name="${escapeXml(g.name)}">
        <instance_geometry url="#${g.id}_geom">
          <bind_material><technique_common><instance_material symbol="${sym}" target="#${matIdOf(g.id)}"/></technique_common></bind_material>
        </instance_geometry>
      </node>`;
  }).join("\n");

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
${effectsXml}
  </library_effects>
  <library_materials>
${materialsXml}
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

    // NEW PATH — multi-image building flow. The 3D model is built directly
    // from the per-floor plans + roof + elevations, with no master prompt
    // and no approval render in between.
    if (data.subject === "building" && data.building && data.building.floors.length) {
      return await runMultiFloorBuilding(key, data);
    }

    if (!data.fileDataUrl) {
      return { ok: false, error: "No drawing was uploaded." };
    }
    const isPdf = data.fileDataUrl.startsWith("data:application/pdf");
    const instruction = data.referenceOnly
      ? (data.subject === "furniture" ? furnitureReferenceRenderingInstruction() : buildingReferenceRenderingInstruction())
      : (data.subject === "furniture" ? furnitureInstruction(data.planUnits) : buildingInstruction(data.planUnits));
    const userContent: Array<Record<string, unknown>> = [
      { type: "text", text: instruction },
      isPdf
        ? { type: "file", file: { filename: "source.pdf", file_data: data.fileDataUrl } }
        : { type: "image_url", image_url: { url: data.fileDataUrl } },
    ];
    // In referenceOnly mode the source IS a finished rendering. Attach every
    // additional reference the user supplied so the modeler can triangulate
    // the silhouette, materials and grouping from multiple angles at 100%
    // fidelity.
    if (data.referenceOnly && data.referenceImages && data.referenceImages.length) {
      userContent.push({
        type: "text",
        text: `ADDITIONAL REFERENCE IMAGES follow — they show the SAME piece/scene from different angles or lighting. Treat them together with the first image as the 100% fidelity source of truth for silhouette, part count, materials and grouping. Do not invent geometry that is not visible in any reference, and do not omit a feature that is visible in any reference.`,
      });
      for (const url of data.referenceImages) {
        if (url === data.fileDataUrl) continue;
        userContent.push({ type: "image_url", image_url: { url } });
      }
    }
    // The master prompt drove the approved rendering — feed it back in so the
    // geometry model uses the SAME shape, size and detail language when
    // reconstructing the .dae. This applies in BOTH normal mode (drawing +
    // approved render) and referenceOnly mode (render-only build) so the 3D
    // output mirrors the rendering 1:1.
    if (data.masterPrompt && data.masterPrompt.trim()) {
      userContent.push({
        type: "text",
        text: `MASTER PROMPT — this is the EXACT prompt that produced the approved rendering above. Treat it as BINDING for the 3D reconstruction: every dimension, proportion, part, material, finish, edge profile and UPPER-CASE feature it mentions MUST be reproduced in the geometry. Do not simplify, omit or restyle anything described here.\n"""\n${data.masterPrompt}\n"""`,
      });
    }
    if (!data.referenceOnly && data.subject === "furniture" && data.approvedRenderUrl) {
      userContent.push({
        type: "text",
        text: `APPROVED RENDERING follows — this is the final approved look of the piece. The 3D geometry MUST match this silhouette and grouping 1:1. Do not separate visually-continuous shapes into multiple parts and do not invent a different shape.`,
      });
      userContent.push({ type: "image_url", image_url: { url: data.approvedRenderUrl } });
    }

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Furniture pieces need maximum shape fidelity to match the approved
        // rendering, so we spend the extra latency on gemini-2.5-pro. Building
        // plans are denser and would time out on pro, so they stay on the fast
        // multimodal model.
        model: data.subject === "furniture" ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview",
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

    const plan = planResult.data.kind === "furniture"
      ? enforcePromptShapeTraits(planResult.data, data.masterPrompt, data.approvedRenderUrl)
      : planResult.data;
    const dae = buildDae(plan, data.wallHeightMeters, data.outputUnits);
    const daeDataUrl = `data:model/vnd.collada+xml;base64,${Buffer.from(dae, "utf8").toString("base64")}`;
    // Reuse the same triangle data to emit OBJ and ASCII FBX so users can
    // download whichever format their CAD tool prefers.
    const { parseDaeToTriangles } = await import("./dae-to-triangles.server");
    const { trianglesToObj, trianglesToFbxAscii, toDataUrl } = await import("./mesh-export.server");
    const groups = parseDaeToTriangles(dae);
    const { obj } = trianglesToObj(groups);
    const fbx = trianglesToFbxAscii(groups);
    const objDataUrl = toDataUrl(obj, "model/obj");
    const fbxDataUrl = toDataUrl(fbx, "application/octet-stream");
    const elementCount = plan.kind === "building"
      ? plan.walls.length + plan.columns.length + plan.stairs.length + plan.fixtures.length
      : plan.parts.length;
    return { ok: true, daeDataUrl, objDataUrl, fbxDataUrl, elementCount, subject: plan.kind, outputUnits: data.outputUnits, plan };
  });

async function runMultiFloorBuilding(
  key: string,
  data: z.infer<typeof FloorTo3DInput>,
): Promise<GenerateFloor3DResult> {
  const building = data.building!;
  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: multiFloorBuildingInstruction(data.planUnits) },
  ];
  const attach = (label: string, url: string) => {
    userContent.push({ type: "text", text: label });
    if (url.startsWith("data:application/pdf")) {
      userContent.push({ type: "file", file: { filename: `${label}.pdf`, file_data: url } });
    } else {
      userContent.push({ type: "image_url", image_url: { url } });
    }
  };

  const sorted = [...building.floors].sort((a, b) => 0).map((f, i) => ({ ...f, index: i }));
  for (const floor of sorted) {
    const lbl = floor.label?.trim() || (floor.index === 0 ? "Ground floor" : `Floor ${floor.index}`);
    attach(`FLOOR ${floor.index} — ${lbl} (floor-to-floor height ${floor.heightMeters.toFixed(2)} m)`, floor.imageDataUrl);
  }
  if (building.roof) attach("ROOF PLAN", building.roof.imageDataUrl);
  for (const elev of building.elevations ?? []) {
    const facingName = { N: "North", S: "South", E: "East", W: "West", other: "Other" }[elev.facing];
    attach(`ELEVATION — ${facingName}${elev.label ? ` (${elev.label})` : ""}`, elev.imageDataUrl);
  }

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
    console.error("multi-floor extract failed", upstream.status, detail.slice(0, 400));
    if (upstream.status === 402) return { ok: false, error: "AI credits are exhausted." };
    if (upstream.status === 429) return { ok: false, error: "The studio is busy. Please retry shortly." };
    return { ok: false, error: "The drawings could not be analysed." };
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

  const planResult = MultiFloorBuildingPlanSchema.safeParse(parsed);
  if (!planResult.success) {
    console.error("multi-floor plan invalid", planResult.error.issues.slice(0, 5));
    return { ok: false, error: "The detected geometry was incomplete. Try clearer drawings with visible dimensions." };
  }

  const { dae, elementCount } = buildMultiFloorBuildingDae(planResult.data, data.outputUnits);
  const daeDataUrl = `data:model/vnd.collada+xml;base64,${Buffer.from(dae, "utf8").toString("base64")}`;
  const { parseDaeToTriangles } = await import("./dae-to-triangles.server");
  const { trianglesToObj, trianglesToFbxAscii, toDataUrl } = await import("./mesh-export.server");
  const groups = parseDaeToTriangles(dae);
  const { obj } = trianglesToObj(groups);
  const fbx = trianglesToFbxAscii(groups);
  const objDataUrl = toDataUrl(obj, "model/obj");
  const fbxDataUrl = toDataUrl(fbx, "application/octet-stream");

  // Return a flattened BuildingPlan stub so the existing client-side
  // summary keeps working. The actual geometry is in the .dae.
  const flat: BuildingPlan = {
    kind: "building",
    units: "meters",
    bounds: { width: planResult.data.bounds.width, length: planResult.data.bounds.length },
    walls: planResult.data.floors.flatMap((f) => f.walls),
    columns: planResult.data.floors.flatMap((f) => f.columns),
    stairs: planResult.data.floors.flatMap((f) => f.stairs),
    fixtures: planResult.data.floors.flatMap((f) => f.fixtures),
  };

  return {
    ok: true,
    daeDataUrl,
    objDataUrl,
    fbxDataUrl,
    elementCount,
    subject: "building",
    outputUnits: data.outputUnits,
    plan: flat,
  };
}