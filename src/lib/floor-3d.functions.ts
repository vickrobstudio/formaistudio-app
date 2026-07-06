import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { LAYER_NAMES, MATERIAL_IDS, MATERIAL_PALETTE, type MaterialId } from "./floor-3d-shared";
import earcut from "earcut";

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
            imageDataUrl2: z
              .string()
              .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
              .max(50_000_000)
              .optional(),
            label: z.string().max(60).optional(),
            heightMeters: z.number().min(0.3).max(15).default(2.7),
            // User two-point scale calibration: real-world width of the plan's
            // longer image side in meters. When set, the extracted geometry is
            // deterministically rescaled to it after parsing.
            planWidthMeters: z.number().min(1).max(500).optional(),
          }),
        )
        .min(1)
        .max(10),
      roof: z
        .array(
          z.object({
            imageDataUrl: z
              .string()
              .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
              .max(50_000_000),
            label: z.string().max(60).optional(),
          }),
        )
        .max(6)
        .optional(),
      site: z
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
      // Scope of THIS request — when present the server emits only the
      // requested piece (site slab, a single floor, or the roof). The
      // client orchestrates the four ordered calls (site → floors → roof)
      // so each piece downloads as its own file.
      scope: z.enum(["site", "floor", "roof"]).optional(),
    })
    .optional(),
});

// Uncertainty label for every extracted element: "confirmed" = printed
// dimension or clearly legible geometry, "inferred" = scaled/cross-referenced
// from other drawings, "assumed" = standard architectural default was used.
const Confidence = z.enum(["confirmed", "inferred", "assumed"]).default("assumed");
export type ElementConfidence = z.infer<typeof Confidence>;

// Extraction-wide notes the model must fill instead of guessing silently.
const NotesFields = {
  assumptions: z.array(z.string().max(240)).max(80).default([]),
  missing: z.array(z.string().max(240)).max(80).default([]),
  conflicts: z.array(z.string().max(240)).max(80).default([]),
};

const OpeningSchema = z.object({
  kind: z.enum(["door", "window"]),
  position: z.number().min(0),
  width: z.number().positive(),
  sillHeight: z.number().min(0).default(0),
  headHeight: z.number().positive().default(2.1),
  confidence: Confidence,
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
  confidence: Confidence,
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
  confidence: Confidence,
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
  confidence: Confidence,
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
  confidence: Confidence,
});

// Enclosed space traced along the inner face of its bounding walls, in the
// same plan coordinates as the walls. Rooms feed the geometry JSON export
// and the assumptions report — they are not solid 3D geometry.
const RoomSchema = z.object({
  name: z.string().max(60).optional(),
  boundary: z.array(z.tuple([z.number(), z.number()])).min(3).max(120),
  confidence: Confidence,
});
export type RoomShape = z.infer<typeof RoomSchema>;

// Shoelace area in m² — computed here, never trusted from the model.
function polygonAreaM2(boundary: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 0; i < boundary.length; i++) {
    const [x1, y1] = boundary[i];
    const [x2, y2] = boundary[(i + 1) % boundary.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

// Drop degenerate AI-returned rooms: near-zero area or larger than the plan.
function cleanRooms(rooms: RoomShape[], planAreaM2: number): RoomShape[] {
  return rooms.filter((r) => {
    const area = polygonAreaM2(r.boundary);
    return area >= 0.5 && (planAreaM2 <= 0 || area <= planAreaM2 * 1.05);
  });
}

const BuildingPlanSchema = z.object({
  kind: z.literal("building"),
  units: z.literal("meters"),
  bounds: z.object({ width: z.number().positive(), length: z.number().positive() }),
  walls: z.array(WallSchema).min(1).max(600),
  columns: z.array(ColumnSchema).max(200).default([]),
  stairs: z.array(StairSchema).max(40).default([]),
  fixtures: z.array(FixtureSchema).max(400).default([]),
  rooms: z.array(RoomSchema).max(120).default([]),
  ...NotesFields,
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
        rooms: z.array(RoomSchema).max(120).default([]),
        ...NotesFields,
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
  ...NotesFields,
});
type MultiFloorBuildingPlan = z.infer<typeof MultiFloorBuildingPlanSchema>;

// Ordered strongest-first multimodal plan analysis chain. Some premium models
// can be temporarily unavailable or rejected by the chat endpoint, so the
// drafter pipeline automatically falls back instead of returning "could not be
// analysed" for the whole drawing set.
// Per user request: NO TIME LIMIT for 3D model creation. We still pass a very
// large abort signal so a hung socket eventually frees the worker, but it is
// long enough (30 minutes) that the model is allowed to fully complete.
const BUILDING_FLOOR_ANALYSIS_TIMEOUT_MS = 1_800_000;
const BUILDING_FAST_FALLBACK_TIMEOUT_MS = 1_800_000;
const BUILDING_ROOF_ANALYSIS_TIMEOUT_MS = 1_800_000;
// All extraction now runs on Claude — see src/lib/claude.server.ts.

type GenerateFloor3DResult =
  | {
      ok: true;
      daeDataUrl: string;
      objDataUrl: string;
      fbxDataUrl: string;
      elementCount: number;
      subject: "building" | "furniture";
      outputUnits: "meters" | "feet";
      plan: BuildingPlan | FurniturePlan;
      /**
       * One entry per floor (ground → top) when the building was assembled
       * from multi-floor drawings. The ground floor entry includes the site
       * (ground slab + grass apron); the top floor entry includes the roof.
       * Always present for buildings, omitted for furniture.
       */
      floorParts?: Array<{
        index: number;
        label: string;
        daeDataUrl: string;
        objDataUrl: string;
        fbxDataUrl: string;
        glbDataUrl?: string;
      }>;
      /** Binary glTF of the whole model (buildings only). */
      glbDataUrl?: string;
      /** Structured "formai.geometry/1" JSON download (buildings only). */
      geometryJsonDataUrl?: string;
      /** Markdown extraction report download (buildings only). */
      reportMarkdownDataUrl?: string;
      report?: {
        assumptions: string[];
        missing: string[];
        conflicts: string[];
        counts: { confirmed: number; inferred: number; assumed: number };
      };
    }
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
- Output compact/minified JSON ONLY, no prose, no Markdown fences, parseable by JSON.parse. Do not pretty-print or add comments.`;

// Shared expert drafter persona prepended to the main extraction prompts.
// The downstream pipeline still requires the strict JSON shapes defined per
// extractor; this preamble only upgrades how the model reads the drawings.
const EXPERT_DRAFTER_PREAMBLE = `You are an EXPERT ARCHITECTURAL 3D MODELER, PROFESSIONAL CAD DRAFTER and BIM-MINDED SPATIAL ANALYST. Think like a senior drafter in a real architecture office, not a decorative AI artist.

CORE MINDSET
- The drawings are the SOURCE OF TRUTH. Written dimensions outrank scaled measurements. If a dimension conflicts with the drawn geometry, trust the printed number and silently reconcile.
- Work in REAL-WORLD SCALE. Preserve wall thicknesses, door sizes, ceiling heights, floor elevations, slab thicknesses, openings, millwork dimensions and architectural alignments exactly as drawn.
- Keep geometry CLEAN: no unnecessary triangulation, overlapping faces, floating elements, broken surfaces, or merged objects that should stay separate. Walls connect cleanly at corners and intersections — no gaps, no overlaps, no duplicates.
- NEVER merge into one blob. Every distinct architectural element becomes its own entry so it imports as its own editable group/component.
- NEVER invent geometry not visible in the drawings. NEVER omit geometry that IS visible. When unsure, make the most logical architectural assumption — do not guess silently.

ELEMENT CLASSIFICATION (use these layer/name conventions when the output schema accepts them)
- Walls: exterior vs interior; structural vs partition; existing vs new vs demolished if shown. Tag exterior envelope walls as "exterior", everything else as "interior". Use printed wall types and poche to decide.
- Doors: each door is its own entry (leaf + frame + opening in host wall + correct swing). Handle single, double, sliding, pocket, storefront, glass and service doors. Doors go in the host wall's "openings" array — never split the wall at an opening.
- Windows & glazing: each window is its own entry with frame, glass and correct sill/head heights from elevations. Storefront/curtain-wall systems modeled as separate glazed assemblies.
- Floors: structural slab vs finished flooring; separate finish zones per material (tile/wood/stone/carpet/concrete/terrazzo). Respect raised platforms, steps, ramps, recessed areas.
- Ceilings & soffits: ceiling planes separate from soffits/bulkheads/coves/clouds. Use the RCP and sections for heights; if multiple ceiling heights exist, model each at its correct elevation.
- Columns & structure: structural columns, pilasters and structural walls stay SEPARATE from partition walls. Use column grids and dimensions for placement.
- Millwork & built-ins: counters, cabinetry, banquettes, reception desks, bars, service stations, display units and wall panels are separate grouped components. Subgroup base/upper/countertop/shelves/panels/kick when the drawings show them.
- Stairs, ramps, railings: each as its own entry; calculate risers/treads/landings/slopes from sections and elevation markers.
- Lighting & fixtures: read the RCP and lighting schedule; place fixtures accurately and keep them separate from ceilings.
- Finishes: identify from hatch patterns, finish tags, room schedules and material notes. Keep finishes separated by material and location.

NAMING
- Use clear architectural labels in the "name" field whenever possible: Wall_EXT_01, Wall_INT_01, Door_D01, Window_W01, Column_C01, Stair_S01, Millwork_Counter_01, Floor_Finish_Tile_01, Ceiling_Soffit_01, etc.

DRAWING ANALYSIS METHOD (do this silently before emitting JSON)
1) Cover sheet & general notes → 2) Floor plans → 3) Dimension plans → 4) Demolition plans → 5) RCPs → 6) Finish plans → 7) Furniture plans → 8) Interior elevations → 9) Building sections → 10) Wall sections → 11) Door/window schedules → 12) Millwork details → 13) Finish schedules → 14) Lighting schedules → 15) Enlarged plans & details.
Cross-check every element across plan, elevation, section and schedule before committing geometry.

DIMENSION PRIORITY (highest to lowest)
1) Written dimensions, 2) Enlarged details, 3) Schedules, 4) Sections & elevations, 5) Gridlines & centerlines, 6) Scaled plan measurements, 7) Logical architectural assumption.

UNCERTAINTY LABELING — NEVER GUESS SILENTLY
Every extracted element carries a "confidence" field:
- "confirmed": a printed dimension, schedule entry or clearly legible geometry defines it.
- "inferred": logically derived by scaling the plan or cross-referencing another drawing.
- "assumed": not shown; a standard architectural default was used (see below).
Alongside the geometry, fill three top-level string arrays:
- "assumptions": one entry per standard default you applied ("Interior wall thickness assumed 0.10 m — not dimensioned").
- "missing": required information that is absent from the drawings ("No ceiling heights printed anywhere in the set").
- "conflicts": every place two drawings disagree, including printed-vs-drawn conflicts you silently reconciled ("Plan scales 3.2 m but printed dimension says 3.5 m — used 3.5 m").
Keep entries short, factual, one fact per entry. Empty arrays are fine when nothing applies.

STANDARD-ASSUMPTION DEFAULTS (use ONLY when the drawings are silent; tag the element "assumed" and log it in "assumptions")
- Exterior wall thickness 0.20 m; interior partition 0.10 m.
- Door: 0.90 m wide, head 2.10 m, sill 0.
- Window: sill 0.90 m, head 2.10 m.
- Floor-to-floor height: residential 2.70 m, commercial 3.00–3.60 m.
- Slab thickness 0.20 m; interior door height 2.10 m.

ROOMS
Detect every enclosed space from the wall boundaries. For each room return its boundary polygon traced along the INNER face of the enclosing walls, in the same plan coordinates and meters as the walls. If a printed room label is legible ("KITCHEN", "BED 2", "LOBBY"), use it as the name and mark the room "confirmed"; otherwise use a generic type name ("Room") and mark it "inferred". Door openings do not break a room boundary — close the loop across them.

IGNORE
- MEP entirely (HVAC, plumbing risers/waste, electrical outlets/switches, panels, conduit, sprinklers, data, mechanical equipment, MEP legends).
- Door swings, dimension lines, text, hatching, north arrows, gridlines, title blocks, revision clouds.

QUALITY CONTROL BEFORE OUTPUT
- All walls align with the 2D plan; corners close cleanly.
- All doors placed correctly with correct swing direction; all windows at correct sill/head heights.
- All floor finishes separated by material; all ceiling heights match RCP and sections.
- All soffits/ceiling drops modeled separately; all millwork grouped independently; all columns separated from walls.
- All openings actually cut into their host wall via the "openings" array.
- No duplicates, no overlapping faces, no merged objects that should stay editable.
- Real-world scale, clean layer/group structure, professional architectural labels.

You will now receive the drawing set. Follow the per-extractor schema exactly — the output MUST be strict JSON matching the shape defined below, with no prose and no Markdown fences.`;

function buildingInstruction(planUnits: z.infer<typeof PlanUnits>) {
  return `${EXPERT_DRAFTER_PREAMBLE}

You are an architectural CAD vectorizer. Inspect the uploaded floor plan of a building (residential, office, retail, hospitality, industrial, etc.) and return STRICT JSON describing every wall.

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
        { "kind": "door"|"window", "position": <m from (x1,y1) along the wall>, "width": <m>, "sillHeight": <m>, "headHeight": <m>, "confidence": "confirmed"|"inferred"|"assumed" }
      ],
      "confidence": "confirmed"|"inferred"|"assumed"
    }
  ],
  "columns": [ { "name": "<label>", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
  "stairs":  [ { "name": "<label>", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "steps": <int>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
  "fixtures":[ { "name": "<label>", "layer": "kitchen"|"bath"|"furniture"|"appliance"|"plumbing"|"<other>", "cx": <m>, "cy": <m>, "cz": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
  "rooms":   [ { "name": "<printed room label or 'Room'>", "boundary": [[<x m>, <y m>], ...], "confidence": "confirmed"|"inferred" } ],
  "assumptions": ["<one entry per standard default you applied>"],
  "missing": ["<required info absent from the drawings>"],
  "conflicts": ["<places two drawings disagree>"]
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
  return `${EXPERT_DRAFTER_PREAMBLE}

You will receive MULTIPLE drawings of the SAME building, one per message part, each preceded by a text label such as "FLOOR 0 — ground (height 3.0 m)", "ROOF PLAN", "ELEVATION — North". Cross-read all of them and return ONE STRICT JSON describing every floor stacked bottom-up, plus the roof.

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
      "walls":    [ { "name": "...", "layer": "exterior"|"interior", "x1": <m>, "y1": <m>, "x2": <m>, "y2": <m>, "thickness": <m>, "height": <optional m>, "confidence": "confirmed"|"inferred"|"assumed", "openings": [ { "kind": "door"|"window", "position": <m>, "width": <m>, "sillHeight": <m>, "headHeight": <m>, "confidence": "confirmed"|"inferred"|"assumed" } ] } ],
      "columns":  [ { "name": "...", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
      "stairs":   [ { "name": "...", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "steps": <int>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
      "fixtures": [ { "name": "...", "layer": "kitchen"|"bath"|"furniture"|"appliance"|"plumbing"|"<other>", "cx": <m>, "cy": <m>, "cz": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
      "rooms":    [ { "name": "<printed room label or 'Room'>", "boundary": [[<x m>, <y m>], ...], "confidence": "confirmed"|"inferred" } ]
    }
  ],
  "roof": { "kind": "flat"|"gable"|"hip"|"shed", "thicknessMeters": <m>, "overhangMeters": <m, optional>, "ridgeHeightMeters": <m above top floor's ceiling, only for gable/hip/shed>, "ridgeAxis": "x"|"y" },
  "assumptions": ["<one entry per standard default you applied>"],
  "missing": ["<required info absent from the drawings>"],
  "conflicts": ["<places two drawings disagree>"]
}

Rules:
- Origin (0,0) at the bottom-left corner of the floor plan, +x right, +y up. Use the SAME origin and the SAME bounds for every floor and for the roof plan so the floors stack vertically aligned. If a floor plan is drawn at a different size, scale and align it to the ground floor's outline.
- Trace every exterior and interior wall on EACH floor as one straight segment between endpoints. Split walls at intersections. Put doors and windows in the wall's "openings" array — never split the wall at an opening.
- "position" is the distance from (x1,y1) along the wall to the START of the opening. Doors: sillHeight 0, headHeight ~2.1 m. Windows: sillHeight ~0.9 m, headHeight ~2.1 m. When the elevations show different sill/head heights, USE those — elevations are the ground truth for vertical positions.
- Use printed wall thicknesses when shown; otherwise 0.20 m exterior, 0.10 m interior.
- Use the elevations to confirm the total building height, floor-to-floor heights, parapet heights, and the roof shape (flat vs pitched). The "roof.kind" must match what the elevations show. For gable/hip/shed, set "ridgeHeightMeters" to the height of the ridge ABOVE the top floor's ceiling and "ridgeAxis" to the axis the ridge runs along.
- Output every floor in the "floors" array in physical stacking order, index 0 = ground floor.
- IGNORE MEP, door swings, dimension lines, text, hatching, north arrows, gridlines, title blocks.
- 100% FIDELITY IS MANDATORY. The drawings are the ground truth. Reproduce them 1:1 — every wall segment, every door, every window, every column, every stair, every fixture that appears in the floor plans MUST appear in the JSON with the same length, position, thickness, opening size and opening position. Cross-check counts: if the plan shows N windows on a facade, the JSON must contain exactly N windows on that wall, and the same N windows must appear at the same X positions in the corresponding elevation. Do not invent, merge, simplify, "round to nearest", omit, or approximate any element. If a measurement is unclear, prefer the printed dimension; if no dimension is printed, measure pixel-accurately against the drawing's scale or another printed dimension.
- Elevations are the vertical ground truth. Read floor-to-floor height, parapet height, ridge height, window sill height and window head height directly from the elevation drawings — these override any default value. Match window/door widths and X positions across plan and elevation; a mismatch means you misread one of them.
- Roof shape MUST match the elevations exactly (flat, gable, hip, shed). Set "ridgeHeightMeters" and "ridgeAxis" so the resulting roof silhouette overlays the elevation 1:1.

${ACCURACY_RULES}`;
}

function parseJsonFromModelText(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObject = cleaned.indexOf("{");
    const firstArray = cleaned.indexOf("[");
    const starts = [firstObject, firstArray].filter((i) => i >= 0);
    const start = starts.length ? Math.min(...starts) : -1;
    if (start < 0) throw new Error("No JSON object found");
    const lastObject = cleaned.lastIndexOf("}");
    const lastArray = cleaned.lastIndexOf("]");
    const end = Math.max(lastObject, lastArray);
    if (end <= start) throw new Error("No complete JSON object found");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

function coerceFloorExtractionJson(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    if (raw.length === 1 && raw[0] && typeof raw[0] === "object" && ("walls" in raw[0] || "columns" in raw[0])) {
      return raw[0];
    }
    if (raw.every((item) => item && typeof item === "object" && ("x1" in item || "x2" in item || "openings" in item))) {
      return { walls: raw, columns: [], stairs: [], fixtures: [] };
    }
  }
  if (!raw || typeof raw !== "object") return raw;
  const candidate = raw as Record<string, unknown>;
  if (candidate.floor && typeof candidate.floor === "object") return coerceFloorExtractionJson(candidate.floor);
  if (candidate.data && typeof candidate.data === "object") return coerceFloorExtractionJson(candidate.data);
  const boundsHint = candidate.boundsHint;
  if (boundsHint && typeof boundsHint === "object") {
    const bounds = boundsHint as Record<string, unknown>;
    const width = typeof bounds.width === "number" ? bounds.width : undefined;
    const length = typeof bounds.length === "number" ? bounds.length : undefined;
    if ((width !== undefined && width <= 0) || (length !== undefined && length <= 0)) {
      const { boundsHint: _boundsHint, ...rest } = candidate;
      return rest;
    }
  }
  return candidate;
}

// Per-floor extractor. ONE floor plan image (plus optional secondary drawing
// of the same floor) → JSON for just that floor. Running these in parallel
// keeps each call small enough to finish well inside the worker timeout and
// lets the powerful model (gemini-2.5-pro) read every wall instead of
// truncating the way one giant multi-floor call does.
function singleFloorExtractInstruction(
  planUnits: z.infer<typeof PlanUnits>,
  label: string,
  heightMeters: number,
) {
  return `${EXPERT_DRAFTER_PREAMBLE}

You are receiving the COMPLETE drawing set of a real building (site plan, every floor plan, the roof plan, and the elevations) and your job is to draft ONE floor only — "${label}" (floor-to-floor height ${heightMeters.toFixed(2)} m) — at 100% fidelity, then return its geometry as STRICT JSON.

You must work the way a real drafter works on a multi-sheet set: read every sheet, build a mental model of the whole building, then commit one floor to paper. Skipping a sheet, simplifying geometry, or "rounding" a number is a failure of the job.

THE DRAWING SET — message parts arrive in this order:
  1) PRIMARY DRAWING — the floor plan of "${label}". Footprint ground truth.
  2) Optional SECONDARY DRAWING — same floor, different sheet (dimensioned plan, RCP, demolition plan). Use it to recover any dimension the primary sheet omits.
  3) Optional SITE PLAN — exterior envelope, orientation (north arrow), set-backs, attached terraces and walkways. Do NOT output its geometry here, but USE it to confirm the orientation and outline of the exterior walls of "${label}".
  4) Optional OTHER FLOOR PLANS — vertical alignment of stair shafts, elevator cores, columns, plumbing chases, structural walls. Do NOT extract their walls into this output, but USE them so the things that must stack actually stack.
  5) Optional ROOF PLAN — eaves outline, ridge lines, parapet location, skylight cutouts. Do NOT extract roof geometry here; USE it to confirm the exterior envelope of the top floor and the location of openings under skylights.
  6) Optional ELEVATIONS (N / S / E / W) — vertical ground truth. They DETERMINE: (a) the COUNT of windows and doors on every exterior facade, (b) each opening's X position along its wall, (c) each opening's width, (d) each opening's sill height, (e) each opening's head height, (f) the floor-to-floor height. If a number is printed on an elevation, that number wins over a visual estimate from the plan.

THINK STEP BY STEP BEFORE EMITTING JSON (silently — return JSON only):
  Step A — IDENTIFY: confirm which sheet is the floor plan of "${label}" (read the title block). If two sheets show this floor, note which is dimensioned and which is graphic.
  Step B — SCALE: lock down the drawing's scale from the printed dimensions and (if shown) the scale bar. Every coordinate you output must be in real-world METERS at this scale.
  Step C — FOOTPRINT: trace the exterior envelope of "${label}" as a closed loop of straight wall segments. Cross-check the loop against the site plan, the roof plan, and the other floors so it lines up with what stacks above and below.
  Step D — INTERIOR PARTITIONS: trace every interior wall — rooms, closets, baths, mechanical chases, hallways, lanais, breezeways, garage walls. Split at intersections.
  Step E — OPENINGS, PER FACADE: for EACH exterior facade, look at the matching elevation. Count the windows and doors visible in that elevation. Place exactly that many openings on the matching exterior wall(s) of "${label}", at the same X positions and widths. Read sill and head heights from the elevation. For interior doors, take width from the plan; sillHeight 0, headHeight ~2.1 m.
  Step F — VERTICAL ELEMENTS: capture every column (rectangular, or round → bounding rectangle), every staircase (overall run + step count), and every fixed fixture (kitchen cabinets, bath fixtures, built-ins, appliances).
  Step G — SELF-AUDIT: re-count exterior wall segments, interior partitions, openings per facade, columns and stairs. If your JSON disagrees with the drawings, fix the JSON.

${PRINTED_UNITS_NOTE[planUnits]}

Return JSON ONLY in this exact shape:
{
  "walls":    [ { "name": "...", "layer": "exterior"|"interior", "x1": <m>, "y1": <m>, "x2": <m>, "y2": <m>, "thickness": <m>, "height": <optional m>, "confidence": "confirmed"|"inferred"|"assumed", "openings": [ { "kind": "door"|"window", "position": <m from (x1,y1)>, "width": <m>, "sillHeight": <m>, "headHeight": <m>, "confidence": "confirmed"|"inferred"|"assumed" } ] } ],
  "columns":  [ { "name": "...", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
  "stairs":   [ { "name": "...", "cx": <m>, "cy": <m>, "width": <m>, "depth": <m>, "height": <m>, "steps": <int>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
  "fixtures": [ { "name": "...", "layer": "kitchen"|"bath"|"furniture"|"appliance"|"plumbing"|"<other>", "cx": <m>, "cy": <m>, "cz": <m>, "width": <m>, "depth": <m>, "height": <m>, "rotationDegZ": <deg>, "confidence": "confirmed"|"inferred"|"assumed" } ],
  "rooms":    [ { "name": "<printed room label or 'Room'>", "boundary": [[<x m>, <y m>], ...], "confidence": "confirmed"|"inferred" } ],
  "boundsHint": { "width": <overall plan width m>, "length": <overall plan length m> },
  "assumptions": ["<one entry per standard default you applied>"],
  "missing": ["<required info absent from the drawings>"],
  "conflicts": ["<places two drawings disagree, including printed-vs-drawn conflicts you reconciled>"]
}

Rules:
- Origin (0,0) at the bottom-left corner of the floor plan, +x right, +y up. Keep these coordinates in METERS at real-world scale.
- Trace EVERY exterior and interior wall as one straight segment between endpoints — do not skip rooms, closets, baths, lanais, breezeways, port cocheres, garage walls or any other partition that is drawn. Split walls at intersections. Diagonal/angled walls keep their true angle.
- Doors and windows go in the parent wall's "openings" array — never split the wall at an opening. Doors: sillHeight 0, headHeight ~2.1 m. Windows: sillHeight ~0.9 m, headHeight ~2.1 m. Use printed dimensions when shown.
- Use printed wall thicknesses when shown; otherwise 0.20 m exterior, 0.10 m interior.
- Capture every column, every staircase, every kitchen/bath/built-in fixture as its own entry.
- IGNORE MEP, door swings, dimension lines, text, hatching, north arrows, gridlines, title blocks.
- 100% FIDELITY IS MANDATORY. If the plan shows N windows on a facade, the JSON must contain N windows AND the matching elevation must also show N windows at the same X positions and widths — if those disagree, look again and reconcile (the printed dimension wins, then the elevation, then the plan). If a wall is 12'-6" long the JSON has 3.81 m; if a wall runs at 45° the JSON keeps that angle. Do not simplify, merge or omit.
- For EACH exterior facade of "${label}", explicitly count the openings in the elevation that faces that wall and place that many openings on the wall, with widths and X positions matching the elevation. Read sill and head heights from the elevation, not from defaults.
- If a SECONDARY drawing of the same floor is attached, cross-read both to pick up dimensions one drawing omits.
- Other floor plans and the roof plan are CONTEXT ONLY — never copy their walls into this floor's output.
- RECONCILIATION ORDER when sources disagree: (1) printed numerical dimension wins, (2) elevation wins for vertical info and opening counts, (3) floor plan wins for horizontal placement and partition layout, (4) site/roof/other floors win for envelope alignment.
- NEVER invent geometry that is not visible in the drawings. NEVER omit geometry that IS visible. If you are not sure whether something is a wall, a hatch or a dimension line, look at the line weight and at the other sheets — drafters never guess.

${ACCURACY_RULES}`;
}

function quickFloorExtractInstruction(
  planUnits: z.infer<typeof PlanUnits>,
  label: string,
  heightMeters: number,
) {
  return `You are an architectural CAD vectorizer running a FAST RECOVERY PASS for a drawing that was too complex for the full extractor. Return STRICT compact JSON for floor "${label}" (floor-to-floor height ${heightMeters.toFixed(2)} m).

${PRINTED_UNITS_NOTE[planUnits]}

Return JSON ONLY in this exact shape:
{ "walls": [ { "name": "", "layer": "exterior"|"interior", "x1": <m>, "y1": <m>, "x2": <m>, "y2": <m>, "thickness": <m>, "openings": [] } ], "columns": [], "stairs": [], "fixtures": [], "boundsHint": { "width": <m>, "length": <m> } }

Rules:
- Prioritize a NON-EMPTY usable model over exhaustive detail: exterior footprint first, then major interior partitions, columns and stairs only if obvious.
- Ignore labels, title blocks, hatching, furniture, door swings, dimension strings and minor fixtures unless they define a wall.
- Use printed dimensions when visible; otherwise estimate scale from the drawing and keep proportions accurate.
- Output short minified JSON only. Every wall must be a straight segment in meters with thickness 0.20 m exterior / 0.10 m interior unless printed otherwise.
- At minimum, return the exterior wall loop. Never return an empty walls array if any building outline is visible.`;
}

// Elevations + roof plans → roof shape, total height, per-floor heights.
// Only used to override defaults; floor footprints come from the per-floor
// passes above.
function roofAndElevationsInstruction(
  planUnits: z.infer<typeof PlanUnits>,
  floorCount: number,
) {
  return `You are an architectural reviewer. You will receive elevation drawings and (optionally) roof plans of a ${floorCount}-floor building. Read the vertical information ONLY and return STRICT JSON.

${PRINTED_UNITS_NOTE[planUnits]}

Return JSON ONLY in this exact shape:
{
  "floorHeightsMeters": [<floor 0 height>, <floor 1 height>, ...],   // floor-to-floor for each of the ${floorCount} floors, in order
  "roof": { "kind": "flat"|"gable"|"hip"|"shed", "thicknessMeters": <m, default 0.2>, "overhangMeters": <m, default 0.4>, "ridgeHeightMeters": <m above top floor's ceiling, omit for flat>, "ridgeAxis": "x"|"y" }
}

Rules:
- Read floor-to-floor heights from the elevation drawings (look at the dimension lines, finish-floor markers, ceiling markers and NAVD elevations). Match each height to a floor index in physical stacking order — index 0 = ground floor.
- "roof.kind" MUST match what the elevations show. Most Florida-style residences with sloped metal roofs are "hip". Use "gable" only when a triangular end wall is clearly visible. Use "flat" when the elevation shows a parapet with no slope.
- For gable/hip/shed, "ridgeHeightMeters" is the height of the ridge ABOVE the top floor's ceiling (use the ROOF BRG and the highest ridge marker). "ridgeAxis" is the axis the ridge runs along in plan: "x" if the ridge runs east-west, "y" if it runs north-south. When in doubt, look at the roof plan.
- Output JSON ONLY, no prose, no Markdown fences, parseable by JSON.parse.`;
}

// Per-floor SELF-CRITIQUE refinement. We feed the model:
//   1) the original floor plan drawing(s)
//   2) every elevation drawing (so it can cross-check opening counts and
//      vertical positions on each facade)
//   3) the JSON it produced in pass 1
// and ask it to act as a strict reviewer: list every error (missing wall,
// wrong length, missing window, wrong opening width or position, missing
// column, etc.) and return a CORRECTED JSON. This is the single biggest
// fidelity boost — it turns one "trust the model" pass into a true
// extract-then-verify loop the way a human draftsperson would work.
function refineFloorInstruction(
  planUnits: z.infer<typeof PlanUnits>,
  label: string,
  heightMeters: number,
  previousJson: string,
) {
  return `You are a STRICT architectural reviewer auditing your own previous extraction of floor "${label}" (floor-to-floor height ${heightMeters.toFixed(2)} m). You will receive:
  1) The ORIGINAL floor plan drawing(s) — the ground truth for the footprint.
  2) Every available ELEVATION drawing — the ground truth for facades (window count per facade, door positions, sill/head heights).
  3) Your PREVIOUS extraction JSON for this floor.

${PRINTED_UNITS_NOTE[planUnits]}

Your job is to find every discrepancy between the previous JSON and the drawings, and return a CORRECTED JSON with the same shape (walls/columns/stairs/fixtures/rooms/boundsHint plus "assumptions"/"missing"/"conflicts" arrays and per-element "confidence" labels). Do NOT preserve the previous JSON as-is — re-trace the plan from scratch and use the previous JSON only as a starting checklist. Every correction you make because the drawings disagreed with the previous JSON belongs in "conflicts".

AUDIT CHECKLIST — work through every item:
- Count every exterior wall segment in the plan. Does the JSON contain that many exterior walls? Add missing ones, fix endpoints to match the drawing, remove duplicates.
- Count every interior partition (rooms, closets, bathrooms, mechanical chases, hallways). Add any that are missing.
- For EACH exterior facade, count windows and doors in the plan AND in the matching elevation. They MUST agree. If the elevation shows 5 windows on the north facade, the JSON must have 5 windows on the north exterior wall(s). Fix counts that disagree.
- Verify each opening's WIDTH against printed dimensions (or pixel-accurate measurement against the drawing's scale) and its POSITION along the wall from (x1,y1). Fix any opening that does not match.
- Verify sill/head heights from the elevations (windows usually sill ≈ 0.9 m, head ≈ 2.1 m unless the elevation shows otherwise).
- Verify wall thicknesses, angles (preserve diagonals), columns (rectangular OR round → bounding rectangle), stairs (overall run + step count), and fixed fixtures (kitchen cabinets, bath fixtures, built-ins).
- IGNORE MEP, door swings, dimension lines, text, hatching, north arrows, gridlines, title blocks.

ABSOLUTE FIDELITY RULES:
- The drawings are the LAW. Where the previous JSON disagrees with the drawing, the drawing wins.
- Never invent geometry that is not visible in the drawing.
- Never omit geometry that IS visible in the drawing.
- Output JSON ONLY, same shape as the per-floor extractor:
{ "walls": [...], "columns": [...], "stairs": [...], "fixtures": [...], "rooms": [...], "boundsHint": { "width": <m>, "length": <m> }, "assumptions": [...], "missing": [...], "conflicts": [...] }

PREVIOUS EXTRACTION (for review only — DO NOT trust it blindly):
\`\`\`json
${previousJson}
\`\`\`

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

/**
 * Tight bounding box of the actual exterior walls of a floor. Used everywhere
 * we need a slab / ceiling / roof footprint so the geometry follows the real
 * building outline instead of the AI-reported plan bounds (which often
 * include the title block, the site, or the yard).
 */
function exteriorBounds(
  walls: z.infer<typeof WallSchema>[],
  fallback: { width: number; length: number },
): { x0: number; y0: number; x1: number; y1: number } | null {
  const exterior = walls.filter((w) => w.layer === "exterior");
  const source = exterior.length ? exterior : walls;
  if (!source.length) {
    if (fallback.width > 0 && fallback.length > 0) {
      return { x0: 0, y0: 0, x1: fallback.width, y1: fallback.length };
    }
    return null;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of source) {
    x0 = Math.min(x0, w.x1, w.x2);
    y0 = Math.min(y0, w.y1, w.y2);
    x1 = Math.max(x1, w.x1, w.x2);
    y1 = Math.max(y1, w.y1, w.y2);
  }
  if (!isFinite(x0) || !isFinite(y0) || x1 - x0 < 0.1 || y1 - y0 < 0.1) return null;
  return { x0, y0, x1, y1 };
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
    // Slab sized to the ACTUAL exterior wall extents — never the AI-reported
    // plan bounds (which often include the site, the yard, or the title
    // block). The slab represents the floor of THIS level only.
    const ext = exteriorBounds(plan.walls, plan.bounds);
    if (ext) {
      const slab = makeGroupBuilder("group_slab", LAYER_NAMES.slab, scale, "concrete_polished");
      slab.addBox(ext.x0, ext.y0, -0.05, ext.x1, ext.y1, 0);
      groups.push(slab.group);
      // Ceiling plane at wall height. The multi-floor pipeline strips this
      // group (its inter-floor slab IS the ceiling of the floor below);
      // single-floor exports keep it via includeCeiling.
      const ceiling = makeGroupBuilder("group_ceiling", LAYER_NAMES.ceilings, scale, "plaster_white");
      ceiling.addBox(ext.x0, ext.y0, wallHeightMeters, ext.x1, ext.y1, wallHeightMeters + 0.05);
      groups.push(ceiling.group);
    }

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
      const label = wall.layer === "exterior" ? LAYER_NAMES.wallsExterior : LAYER_NAMES.wallsInterior;
      const b = bucketFor(wallBuckets, `walls_${wall.layer}`, label, wall.material, wall.colorHex);
      addWallWithOpenings(b.addCorners, wall, wallHeightMeters);
    }
    for (const b of wallBuckets.values()) groups.push(b.group);

    // Doors and windows — every wall opening becomes a real 3D element so
    // the .dae shows actual door leaves and glass panes inside the holes
    // the wall geometry cut out (instead of empty rectangles).
    const doorBucket = makeGroupBuilder("group_doors", LAYER_NAMES.doors, scale, "wood_oak");
    const windowGlass = makeGroupBuilder("group_window_glass", LAYER_NAMES.windows, scale, "glass_clear");
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
          // Window: a single glass pane filling the opening cut out of the
          // wall — NO invented frame. The drawings already define the
          // opening; we just fill the hole with glass.
          const glassThickness = Math.min(0.02, wall.thickness * 0.25);
          addRotatedBox(windowGlass.addCorners, cx, cy, sill + hOp / 2, wOp, glassThickness, hOp, angleDeg);
        }
      }
    }
    if (doorBucket.group.positions.length) groups.push(doorBucket.group);
    if (windowGlass.group.positions.length) groups.push(windowGlass.group);

    if (plan.columns.length) {
      const cache = new Map<string, ReturnType<typeof makeGroupBuilder>>();
      for (const c of plan.columns) {
        const b = bucketFor(cache, "columns", LAYER_NAMES.columns, c.material, c.colorHex);
        addRotatedBox(b.addCorners, c.cx, c.cy, c.height / 2, c.width, c.depth, c.height, c.rotationDegZ);
      }
      for (const b of cache.values()) groups.push(b.group);
    }
    if (plan.stairs.length) {
      const cache = new Map<string, ReturnType<typeof makeGroupBuilder>>();
      for (const s of plan.stairs) {
        const g = bucketFor(cache, "stairs", LAYER_NAMES.stairs, s.material, s.colorHex);
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
        const b = bucketFor(cache, `fixtures_${layerKey}`, `${LAYER_NAMES.millwork} - ${layerKey}`, f.material, f.colorHex);
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
): { dae: string; groups: Group[] } {
  const groups = buildGroups(plan, wallHeightMeters, outputUnits);
  return { dae: emitDaeFromGroups(groups, outputUnits), groups };
}

function buildMultiFloorBuildingDae(
  multi: MultiFloorBuildingPlan,
  outputUnits: "meters" | "feet",
  options: { includeSite?: boolean; includeRoof?: boolean; includeInterFloorSlab?: boolean; includeFloors?: boolean; includeCeiling?: boolean } = {},
): { dae: string; elementCount: number; groups: Group[] } {
  const scale = outputUnits === "feet" ? 1 / 0.3048 : 1;
  const allGroups: Group[] = [];
  let elementCount = 0;

  const includeSite = options.includeSite ?? true;
  const includeRoof = options.includeRoof ?? true;
  const includeInterFloorSlab = options.includeInterFloorSlab ?? true;
  const includeFloors = options.includeFloors ?? true;
  const includeCeiling = options.includeCeiling ?? false;

  // Sort floors by index, ground → top
  const sortedFloors = [...multi.floors].sort((a, b) => a.index - b.index);

  // Tight outline of the building taken from the ground floor's exterior
  // walls. Used for every horizontal slab (site, inter-floor, roof). We
  // never invent grass, lawns, walkways, set-backs or any other site
  // geometry that is not present in the drawings.
  const groundExt = sortedFloors[0]
    ? exteriorBounds(sortedFloors[0].walls, multi.bounds)
    : null;

  // ── Site: ground slab ONLY, sized to the actual building footprint.
  if (includeSite && groundExt) {
    const ground = makeGroupBuilder("site_ground_slab", "Ground slab", scale, "concrete_polished");
    ground.addBox(groundExt.x0, groundExt.y0, -0.2, groundExt.x1, groundExt.y1, 0);
    ground.group.parentPath = [LAYER_NAMES.site];
    allGroups.push(ground.group);
  }

  // Category label derived from the buildGroups id prefix so each floor gets
  // a clean Walls / Doors / Windows / Columns / Stairs / Fixtures / Slabs /
  // Ceiling subfolder on .dae import.
  const categoryFor = (id: string): string => {
    if (id.startsWith("group_walls_exterior")) return LAYER_NAMES.wallsExterior;
    if (id.startsWith("group_walls_interior")) return LAYER_NAMES.wallsInterior;
    if (id === "group_doors") return LAYER_NAMES.doors;
    if (id === "group_window_glass") return LAYER_NAMES.windows;
    if (id.startsWith("group_columns")) return LAYER_NAMES.columns;
    if (id.startsWith("group_stairs")) return LAYER_NAMES.stairs;
    if (id.startsWith("group_fixtures_")) {
      const layer = id.replace(/^group_fixtures_/, "").split("__")[0];
      const pretty = layer.charAt(0).toUpperCase() + layer.slice(1);
      return `${LAYER_NAMES.millwork} / ${pretty}`;
    }
    if (id === "group_ceiling") return LAYER_NAMES.ceilings;
    if (id === "group_slab") return LAYER_NAMES.slab;
    return "Other";
  };

  let zOffset = 0;
  for (let i = 0; i < sortedFloors.length; i++) {
    const floor = sortedFloors[i];
    const floorNum = String(floor.index + 1).padStart(2, "0");
    const floorTitle = floor.label?.trim()
      ? `Floor ${floorNum} — ${floor.label.trim()}`
      : `Floor ${floorNum}`;
    if (includeFloors) {
      const subPlan: BuildingPlan = {
        kind: "building",
        units: "meters",
        bounds: multi.bounds,
        walls: floor.walls,
        columns: floor.columns,
        stairs: floor.stairs,
        fixtures: floor.fixtures,
        rooms: floor.rooms,
        assumptions: floor.assumptions,
        missing: floor.missing,
        conflicts: floor.conflicts,
      };
      const floorGroups = buildGroups(subPlan, floor.heightMeters, outputUnits)
        // strip the per-floor slab — multi-floor adds slabs explicitly. The
        // ceiling plane survives only for single-floor exports (includeCeiling).
        .filter((g) => g.id !== "group_slab" && (includeCeiling || g.id !== "group_ceiling"));
      const dzScaled = zOffset * scale;
      for (const g of floorGroups) {
        for (let p = 2; p < g.positions.length; p += 3) g.positions[p] += dzScaled;
        const category = categoryFor(g.id);
        g.id = `f${floor.index}_${g.id}`;
        g.parentPath = [floorTitle, category];
        allGroups.push(g);
      }
      elementCount += floor.walls.length + floor.columns.length + floor.stairs.length + floor.fixtures.length;
    }

    zOffset += floor.heightMeters;

    // Inter-floor slab (acts as ceiling of below + floor of above).
    // The roof above replaces the slab on top.
    const isTop = i === sortedFloors.length - 1;
    if (includeFloors && !isTop && includeInterFloorSlab) {
      // Slab outline = exterior of THIS floor (which is also the floor of
      // the next level above). Never the full plan bounds.
      const slabExt = exteriorBounds(floor.walls, multi.bounds);
      if (slabExt) {
      const slab = makeGroupBuilder(
        `group_slab_between_${floor.index}_${floor.index + 1}`,
        `Slab above ${floorTitle}`,
        scale,
        "concrete_polished",
      );
        slab.addBox(slabExt.x0, slabExt.y0, zOffset - 0.12, slabExt.x1, slabExt.y1, zOffset);
      slab.group.parentPath = [floorTitle, `${LAYER_NAMES.ceilings} / Slab above`];
      allGroups.push(slab.group);
      }
    }
  }

  if (includeRoof) {
    const roof = multi.roof ?? { kind: "flat" as const, thicknessMeters: 0.2 };
    // Overhang ONLY if the AI read one from the elevations. No invented eave.
    const overhang = roof.overhangMeters ?? 0;
    // Roof outline = exterior of the TOP floor. Falls back to overall bounds
    // only if no top floor walls were captured.
    const topFloor = sortedFloors[sortedFloors.length - 1];
    const roofExt = topFloor ? exteriorBounds(topFloor.walls, multi.bounds) : null;
    const rx0 = (roofExt?.x0 ?? 0) - overhang;
    const ry0 = (roofExt?.y0 ?? 0) - overhang;
    const rx1 = (roofExt?.x1 ?? multi.bounds.width) + overhang;
    const ry1 = (roofExt?.y1 ?? multi.bounds.length) + overhang;
    // Roof-only export sits at z=0 so SketchUp/Blender open it cleanly.
    const roofBase = includeFloors ? zOffset : 0;
    const roofSlab = makeGroupBuilder(
      "roof_slab",
      `Roof — ${roof.kind}`,
      scale,
      "concrete_polished",
    );
    roofSlab.addBox(
      rx0,
      ry0,
      roofBase,
      rx1,
      ry1,
      roofBase + roof.thicknessMeters,
    );
    roofSlab.group.parentPath = [LAYER_NAMES.roof];
    allGroups.push(roofSlab.group);
    elementCount += 1;
  }

  return { dae: emitDaeFromGroups(allGroups, outputUnits), elementCount, groups: allGroups };
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

  // Build a nested <node> tree from each group's parentPath so SketchUp /
  // Blender / 3ds Max import the model with a clean group hierarchy:
  //   Scene
  //     Floor 01 — Ground
  //       Walls / Exterior
  //         <geometry>
  //       Walls / Interior
  //       Doors
  //       Windows
  //       ...
  //     Floor 02
  //     Roof
  //     Site
  type TreeNode = { name: string; id: string; children: Map<string, TreeNode>; leaves: Group[] };
  const root: TreeNode = { name: "Scene", id: "Scene", children: new Map(), leaves: [] };
  let nodeIdCounter = 0;
  const slugify = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").toLowerCase().replace(/^_|_$/g, "") || `n${nodeIdCounter++}`;
  for (const g of groups) {
    let cursor = root;
    for (const seg of g.parentPath ?? []) {
      let child = cursor.children.get(seg);
      if (!child) {
        child = { name: seg, id: `${cursor.id}_${slugify(seg)}`, children: new Map(), leaves: [] };
        cursor.children.set(seg, child);
      }
      cursor = child;
    }
    cursor.leaves.push(g);
  }
  const renderLeaf = (g: Group, indent: string) => {
    const sym = matSymbol(g.id);
    return `${indent}<node id="${g.id}_node" name="${escapeXml(g.name)}">
${indent}  <instance_geometry url="#${g.id}_geom">
${indent}    <bind_material><technique_common><instance_material symbol="${sym}" target="#${matIdOf(g.id)}"/></technique_common></bind_material>
${indent}  </instance_geometry>
${indent}</node>`;
  };
  const renderTree = (node: TreeNode, indent: string): string => {
    const parts: string[] = [];
    for (const leaf of node.leaves) parts.push(renderLeaf(leaf, indent));
    for (const child of node.children.values()) {
      const inner = renderTree(child, indent + "  ");
      parts.push(`${indent}<node id="${child.id}_node" name="${escapeXml(child.name)}">
${inner}
${indent}</node>`);
    }
    return parts.join("\n");
  };
  const sceneTreeXml = renderTree(root, "      ");

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
${sceneTreeXml}
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#Scene"/></scene>
</COLLADA>`;
}

// ── Mesh geometry validation ───────────────────────────────────────────
// Refuses to export any DAE / OBJ / FBX whose triangles parse to an empty
// or degenerate mesh: zero vertices, zero triangles, no finite coordinates,
// or a zero-volume bounding box. Catches cases where the wall/floor data
// parsed but the builder produced nothing renderable, so the user never
// downloads a blank file.
type MeshValidation = { ok: true } | { ok: false; reason: string };
function validateMeshGeometry(
  groups: Array<{ positions: Float32Array | number[]; indices: Uint32Array | number[] }>,
): MeshValidation {
  if (!groups || groups.length === 0) return { ok: false, reason: "no mesh groups" };
  let totalVerts = 0;
  let totalTris = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const g of groups) {
    const pos = g.positions;
    const idx = g.indices;
    const vCount = pos.length / 3;
    const tCount = idx.length / 3;
    totalVerts += vCount;
    totalTris += tCount;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return { ok: false, reason: "mesh contains non-finite vertex coordinates" };
      }
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  if (totalVerts === 0) return { ok: false, reason: "mesh has 0 vertices" };
  if (totalTris === 0) return { ok: false, reason: "mesh has 0 triangles" };
  const dx = maxX - minX, dy = maxY - minY, dz = maxZ - minZ;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) {
    return { ok: false, reason: "mesh bounding box is not finite" };
  }
  // Allow flat plates (one zero extent) but reject a fully zero-volume bbox.
  const nonZero = (dx > 1e-6 ? 1 : 0) + (dy > 1e-6 ? 1 : 0) + (dz > 1e-6 ? 1 : 0);
  if (nonZero < 2) {
    return { ok: false, reason: `degenerate bounding box ${dx.toFixed(4)} x ${dy.toFixed(4)} x ${dz.toFixed(4)}` };
  }
  return { ok: true };
}

export const generateFloor3D = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FloorTo3DInput.parse(input))
  .handler(async ({ data }): Promise<GenerateFloor3DResult> => {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "The 2D to 3D service is unavailable." };

    // NEW PATH — multi-image building flow. The 3D model is built directly
    // from the per-floor plans + roof + elevations, with no master prompt
    // and no approval render in between.
    if (data.subject === "building" && data.building && data.building.floors.length) {
      return await runMultiFloorBuilding(data);
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

    const { claudeExtractJson } = await import("./claude.server");
    const extraction = await claudeExtractJson({ parts: userContent, timeoutMs: 5 * 60 * 1000 });
    if (!extraction.ok) return { ok: false, error: extraction.error };

    let parsed: unknown;
    try {
      parsed = parseJsonFromModelText(extraction.text);
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
    const { dae, groups: builtGroups } = buildDae(plan, data.wallHeightMeters, data.outputUnits);
    const daeDataUrl = `data:model/vnd.collada+xml;base64,${Buffer.from(dae, "utf8").toString("base64")}`;
    // Reuse the same triangle data to emit OBJ and ASCII FBX so users can
    // download whichever format their CAD tool prefers.
    const { parseDaeToTriangles } = await import("./dae-to-triangles.server");
    const { trianglesToObj, trianglesToFbxAscii, toDataUrl } = await import("./mesh-export.server");
    const groups = parseDaeToTriangles(dae);
    const validation = validateMeshGeometry(groups);
    if (!validation.ok) {
      // Single-subject path has only one mesh; there is no remaining
      // geometry to ship, so surface a clear error instead of exporting
      // an empty file.
      console.error(`[single] geometry validation failed — no export: ${validation.reason}`);
      return { ok: false, error: `Generated 3D geometry was empty or degenerate (${validation.reason}). Try a clearer cropped reference image.` } as GenerateFloor3DResult;
    }
    const { obj } = trianglesToObj(groups);
    const fbx = trianglesToFbxAscii(groups);
    const objDataUrl = toDataUrl(obj, "model/obj");
    const fbxDataUrl = toDataUrl(fbx, "application/octet-stream");
    const elementCount = plan.kind === "building"
      ? plan.walls.length + plan.columns.length + plan.stairs.length + plan.fixtures.length
      : plan.parts.length;
    const extras = plan.kind === "building"
      ? await buildingReportExtras({
          levels: [{
            index: 0,
            label: "Ground floor",
            heightMeters: data.wallHeightMeters,
            walls: plan.walls,
            columns: plan.columns,
            stairs: plan.stairs,
            fixtures: plan.fixtures,
            rooms: plan.rooms,
          }],
          bounds: plan.bounds,
          planUnits: data.planUnits,
          scale: { method: "printed_dimensions" },
          assumptions: plan.assumptions,
          missing: plan.missing,
          conflicts: plan.conflicts,
        })
      : {};
    let glbDataUrl: string | undefined;
    if (plan.kind === "building") {
      const { trianglesToGlb, glbToDataUrlBinary } = await import("./glb-export.server");
      glbDataUrl = glbToDataUrlBinary(trianglesToGlb(builtGroups, data.outputUnits));
    }
    return { ok: true, daeDataUrl, objDataUrl, fbxDataUrl, elementCount, subject: plan.kind, outputUnits: data.outputUnits, plan, glbDataUrl, ...extras };
  });

// Structured JSON + markdown report extras appended to every building result.
async function buildingReportExtras(args: {
  levels: import("./geometry-json").GeometryJsonInput["levels"];
  bounds: { width: number; length: number };
  planUnits: z.infer<typeof PlanUnits>;
  scale: import("./geometry-json").ScaleSource;
  assumptions: string[];
  missing: string[];
  conflicts: string[];
}) {
  const { buildGeometryJson, buildAssumptionsMarkdown } = await import("./geometry-json");
  const { toDataUrl } = await import("./mesh-export.server");
  const json = buildGeometryJson({
    levels: args.levels,
    bounds: args.bounds,
    planUnits: args.planUnits,
    scale: args.scale,
    assumptions: args.assumptions,
    missing: args.missing,
    conflicts: args.conflicts,
  });
  const counts = { confirmed: 0, inferred: 0, assumed: 0 };
  for (const o of json.objects) counts[o.confidence]++;
  return {
    geometryJsonDataUrl: toDataUrl(JSON.stringify(json, null, 2), "application/json"),
    reportMarkdownDataUrl: toDataUrl(buildAssumptionsMarkdown(json), "text/markdown"),
    report: { assumptions: args.assumptions, missing: args.missing, conflicts: args.conflicts, counts },
  };
}

async function runMultiFloorBuilding(
  data: z.infer<typeof FloorTo3DInput>,
): Promise<GenerateFloor3DResult> {
  const building = data.building!;
  const floors = building.floors.map((f, i) => ({ ...f, index: i }));

  // Helper: one multimodal Claude call, returns parsed JSON or throws.
  // Retries once — Claude occasionally returns geometry the validator
  // rejects; a second attempt recovers most of those.
  async function callJson(
    content: Array<Record<string, unknown>>,
    label: string,
    timeoutMs = BUILDING_FLOOR_ANALYSIS_TIMEOUT_MS,
    validate?: (json: unknown) => string | null,
    attempts = 2,
  ): Promise<unknown> {
    const { claudeExtractJson } = await import("./claude.server");
    let lastStatus: number | undefined;
    let lastMessage = "";

    for (let attempt = 0; attempt < attempts; attempt++) {
      const result = await claudeExtractJson({ parts: content, timeoutMs });
      if (!result.ok) {
        lastStatus = result.status;
        lastMessage = result.error;
        console.error(`[${label}] extract failed`, result.status, result.error.slice(0, 300));
        // Auth/credit failures won't improve on retry.
        if (result.status === 401 || result.status === 402 || result.status === 403) {
          const err = new Error(`upstream_${result.status}`);
          (err as Error & { status?: number }).status = result.status;
          throw err;
        }
        continue;
      }
      try {
        const json = parseJsonFromModelText(result.text);
        const invalidReason = validate?.(json);
        if (invalidReason) {
          lastMessage = invalidReason;
          console.error(`[${label}] returned unusable geometry`, invalidReason.slice(0, 300));
          continue;
        }
        return json;
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${label}] extract parse failed`, lastMessage.slice(0, 300));
      }
    }

    const err = new Error(`upstream_${lastStatus ?? "analysis"}`);
    (err as Error & { status?: number; detail?: string }).status = lastStatus;
    (err as Error & { status?: number; detail?: string }).detail = lastMessage;
    throw err;
  }

  const attachImg = (parts: Array<Record<string, unknown>>, url: string, filename: string) => {
    if (url.startsWith("data:application/pdf")) {
      parts.push({ type: "file", file: { filename: `${filename}.pdf`, file_data: url } });
    } else {
      parts.push({ type: "image_url", image_url: { url } });
    }
  };

  // Per-floor extraction in parallel.
  const floorExtractSchema = z.object({
    walls: z.array(WallSchema).max(600).default([]),
    columns: z.array(ColumnSchema).max(200).default([]),
    stairs: z.array(StairSchema).max(40).default([]),
    fixtures: z.array(FixtureSchema).max(400).default([]),
    rooms: z.array(RoomSchema).max(120).default([]),
    boundsHint: z.object({ width: z.number().positive(), length: z.number().positive() }).optional(),
    ...NotesFields,
  });

  type FloorOut = z.infer<typeof floorExtractSchema> & { index: number; label: string; heightMeters: number };

  const floorWallCount = (floor: z.infer<typeof floorExtractSchema>) =>
    floor.walls.filter((wall) => Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) >= 0.1).length;

  const validateFloorExtraction = (raw: unknown): string | null => {
    const parsed = floorExtractSchema.safeParse(coerceFloorExtractionJson(raw));
    if (!parsed.success) return `schema invalid: ${parsed.error.issues.slice(0, 3).map((issue) => issue.path.join(".") || issue.message).join(", ")}`;
    if (floorWallCount(parsed.data) === 0) return "no wall geometry was extracted from the drawing";
    return null;
  };

  // Deterministic user-calibration rescale. The prompt hint nudges the model,
  // but the guarantee comes from rescaling every horizontal coordinate here so
  // the plan's larger extent equals the user-measured width. Heights stay
  // untouched — calibration is horizontal only.
  const applyUserScale = (
    f: z.infer<typeof floorExtractSchema>,
    planWidthMeters: number | undefined,
  ): z.infer<typeof floorExtractSchema> => {
    if (!planWidthMeters) return f;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const w of f.walls) {
      minX = Math.min(minX, w.x1, w.x2); maxX = Math.max(maxX, w.x1, w.x2);
      minY = Math.min(minY, w.y1, w.y2); maxY = Math.max(maxY, w.y1, w.y2);
    }
    const extent = Math.max(maxX - minX, maxY - minY);
    if (!isFinite(extent) || extent < 0.5) return f;
    const k = planWidthMeters / extent;
    if (!isFinite(k) || k <= 0 || Math.abs(k - 1) < 0.02) return f;
    const s = (n: number) => n * k;
    return {
      ...f,
      walls: f.walls.map((w) => ({
        ...w,
        x1: s(w.x1), y1: s(w.y1), x2: s(w.x2), y2: s(w.y2),
        thickness: Math.min(1, Math.max(0.05, s(w.thickness))),
        openings: w.openings.map((op) => ({ ...op, position: s(op.position), width: s(op.width) })),
      })),
      columns: f.columns.map((c) => ({ ...c, cx: s(c.cx), cy: s(c.cy), width: s(c.width), depth: s(c.depth) })),
      stairs: f.stairs.map((st) => ({ ...st, cx: s(st.cx), cy: s(st.cy), width: s(st.width), depth: s(st.depth) })),
      fixtures: f.fixtures.map((fx) => ({ ...fx, cx: s(fx.cx), cy: s(fx.cy), width: s(fx.width), depth: s(fx.depth) })),
      rooms: f.rooms.map((r) => ({ ...r, boundary: r.boundary.map(([x, y]) => [s(x), s(y)] as [number, number]) })),
      boundsHint: f.boundsHint ? { width: s(f.boundsHint.width), length: s(f.boundsHint.length) } : f.boundsHint,
    };
  };

  const floorPromises = floors.map(async (floor): Promise<FloorOut | { error: string; status?: number }> => {
    const lbl = floor.label?.trim() || (floor.index === 0 ? "Ground floor" : `Floor ${floor.index}`);
    const parts: Array<Record<string, unknown>> = [
      { type: "text", text: singleFloorExtractInstruction(data.planUnits, lbl, floor.heightMeters) },
      ...(floor.planWidthMeters
        ? [{ type: "text", text: `USER CALIBRATION — the user measured this plan: its overall extent along the longer axis is exactly ${floor.planWidthMeters.toFixed(2)} m. Calibrate every coordinate to this measurement; it outranks any scale you infer from the drawing.` }]
        : []),
      { type: "text", text: `PRIMARY DRAWING — ${lbl}` },
    ];
    attachImg(parts, floor.imageDataUrl, `floor_${floor.index}_a`);
    if (floor.imageDataUrl2) {
      parts.push({ type: "text", text: `SECONDARY DRAWING — same floor (${lbl})` });
      attachImg(parts, floor.imageDataUrl2, `floor_${floor.index}_b`);
    }
    // Site plan — context only for the exterior envelope.
    if (building.site?.imageDataUrl) {
      parts.push({ type: "text", text: `SITE PLAN — context only, use to verify the exterior envelope and orientation of ${lbl}` });
      attachImg(parts, building.site.imageDataUrl, `site`);
    }
    // OTHER floor plans — context only, for vertical alignment (stairs, columns, chases).
    for (const other of floors) {
      if (other.index === floor.index) continue;
      const otherLbl = other.label?.trim() || (other.index === 0 ? "Ground floor" : `Floor ${other.index}`);
      parts.push({ type: "text", text: `OTHER FLOOR PLAN — ${otherLbl} (context only, do NOT extract — use for stair/column/chase alignment with ${lbl})` });
      attachImg(parts, other.imageDataUrl, `floor_${other.index}_ref`);
    }
    // Roof plan(s) — context only.
    for (const [i, roof] of (building.roof ?? []).entries()) {
      parts.push({ type: "text", text: `ROOF PLAN ${i + 1}${roof.label ? ` — ${roof.label}` : ""} (context only, do NOT extract walls — use to verify the exterior envelope of ${lbl})` });
      attachImg(parts, roof.imageDataUrl, `roof_${i}_ref`);
    }
    // Elevations — vertical ground truth for openings on EACH exterior facade.
    for (const elev of building.elevations ?? []) {
      const facingName = { N: "North", S: "South", E: "East", W: "West", other: "Other" }[elev.facing];
      parts.push({ type: "text", text: `ELEVATION — ${facingName}${elev.label ? ` (${elev.label})` : ""} — verify the openings on the ${facingName.toLowerCase()} exterior wall of ${lbl} against this drawing` });
      attachImg(parts, elev.imageDataUrl, `elev_${facingName}_ref`);
    }
    try {
      const json = coerceFloorExtractionJson(await callJson(parts, `floor-${floor.index}`, BUILDING_FLOOR_ANALYSIS_TIMEOUT_MS, validateFloorExtraction));
      const parsed = floorExtractSchema.safeParse(json);
      if (!parsed.success) {
        console.error(`floor ${floor.index} schema invalid`, parsed.error.issues.slice(0, 3));
        return { error: `Floor ${floor.index + 1} could not be parsed.` };
      }
      if (floorWallCount(parsed.data) === 0) {
        return { error: `Floor ${floor.index + 1} returned no wall geometry.` };
      }
      return { ...applyUserScale(parsed.data, floor.planWidthMeters), index: floor.index, label: lbl, heightMeters: floor.heightMeters };
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 402 || status === 403 || status === 429) {
        return { error: `Floor ${floor.index + 1} extraction failed.`, status };
      }
      try {
        const fallbackParts: Array<Record<string, unknown>> = [
          { type: "text", text: quickFloorExtractInstruction(data.planUnits, lbl, floor.heightMeters) },
          { type: "text", text: `PRIMARY DRAWING — ${lbl}` },
        ];
        attachImg(fallbackParts, floor.imageDataUrl, `floor_${floor.index}_fast_a`);
        if (floor.imageDataUrl2) {
          fallbackParts.push({ type: "text", text: `SECONDARY DRAWING — same floor (${lbl})` });
          attachImg(fallbackParts, floor.imageDataUrl2, `floor_${floor.index}_fast_b`);
        }
        const fallbackJson = coerceFloorExtractionJson(await callJson(
          fallbackParts,
          `floor-${floor.index}-fast-fallback`,
          BUILDING_FAST_FALLBACK_TIMEOUT_MS,
          validateFloorExtraction,
          1,
        ));
        const fallbackParsed = floorExtractSchema.safeParse(fallbackJson);
        if (fallbackParsed.success && floorWallCount(fallbackParsed.data) > 0) {
          console.warn(`floor ${floor.index} used fast fallback extraction after detailed pass failed`);
          return { ...applyUserScale(fallbackParsed.data, floor.planWidthMeters), index: floor.index, label: lbl, heightMeters: floor.heightMeters };
        }
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        console.error(`floor ${floor.index} fast fallback failed`, fallbackMessage.slice(0, 300));
      }
      if (e instanceof DOMException && e.name === "TimeoutError") {
        return { error: `Floor ${floor.index + 1} analysis timed out.`, status: 408 };
      }
      return { error: `Floor ${floor.index + 1} extraction failed.`, status };
    }
  });

  // Roof + elevations pass in parallel.
  const roofSchema = z.object({
    floorHeightsMeters: z.array(z.number().min(1).max(10)).max(10).optional(),
    roof: z
      .object({
        kind: z.enum(["flat", "gable", "hip", "shed"]).default("hip"),
        thicknessMeters: z.number().min(0.05).max(0.6).default(0.2),
        overhangMeters: z.number().min(0).max(2).default(0).optional(),
        ridgeHeightMeters: z.number().min(0).max(8).optional(),
        ridgeAxis: z.enum(["x", "y"]).optional(),
      })
      .optional(),
  });

  const hasRoofOrElev = (building.roof?.length ?? 0) > 0 || (building.elevations?.length ?? 0) > 0;
  const roofPromise: Promise<z.infer<typeof roofSchema> | null> = hasRoofOrElev
    ? (async () => {
        const parts: Array<Record<string, unknown>> = [
          { type: "text", text: roofAndElevationsInstruction(data.planUnits, floors.length) },
        ];
        for (const [i, roof] of (building.roof ?? []).entries()) {
          parts.push({ type: "text", text: `ROOF PLAN ${i + 1}${roof.label ? ` — ${roof.label}` : ""}` });
          attachImg(parts, roof.imageDataUrl, `roof_${i}`);
        }
        for (const elev of building.elevations ?? []) {
          const facingName = { N: "North", S: "South", E: "East", W: "West", other: "Other" }[elev.facing];
          parts.push({ type: "text", text: `ELEVATION — ${facingName}${elev.label ? ` (${elev.label})` : ""}` });
          attachImg(parts, elev.imageDataUrl, `elev_${facingName}`);
        }
        try {
          const json = await callJson(parts, "roof-elev", BUILDING_ROOF_ANALYSIS_TIMEOUT_MS);
          const parsed = roofSchema.safeParse(json);
          return parsed.success ? parsed.data : null;
        } catch (e) {
          console.error("roof/elev extract failed", e);
          return null;
        }
      })()
    : Promise.resolve(null);

  const [floorResults, roofResult] = await Promise.all([Promise.all(floorPromises), roofPromise]);

  // Fail fast if every floor failed.
  const goodFloors = floorResults.filter((f): f is FloorOut => !("error" in f));
  if (goodFloors.length === 0) {
    const first = floorResults[0] as { error?: string; status?: number };
    if (first?.status === 402) return { ok: false, error: "AI credits are exhausted." };
    if (first?.status === 429) return { ok: false, error: "The studio is busy. Please retry shortly." };
    if (first?.status === 401 || first?.status === 403) return { ok: false, error: "The 2D to 3D service is unavailable." };
    if (first?.status === 408) return { ok: false, error: "Analysis timed out on this drawing. Try a clearer cropped floor-plan image first, then add roof/elevations after the floor works." };
    return { ok: false, error: "The drawings could not be analysed. Try clearer images with visible dimensions." };
  }

  // NOTE: A second self-critique refinement pass was previously run here,
  // but doubling the per-floor model calls pushed the total request past the
  // Cloudflare Worker subrequest budget (~120s) and caused every build to
  // return "failed" via upstream 499 cancellations. We now rely on the
  // strict per-floor extraction prompt alone.
  const refinedFloors: FloorOut[] = goodFloors;

  // Compute overall bounds from each floor's boundsHint or wall extents.
  let maxW = 0, maxL = 0;
  for (const f of refinedFloors) {
    if (f.boundsHint) {
      maxW = Math.max(maxW, f.boundsHint.width);
      maxL = Math.max(maxL, f.boundsHint.length);
    }
    for (const w of f.walls) {
      maxW = Math.max(maxW, w.x1, w.x2);
      maxL = Math.max(maxL, w.y1, w.y2);
    }
  }
  if (maxW < 1) maxW = 30;
  if (maxL < 1) maxL = 30;

  // Apply roof-pass overrides for per-floor heights when available.
  const floorsForPlan = refinedFloors
    .sort((a, b) => a.index - b.index)
    .map((f) => ({
      index: f.index,
      label: f.label,
      heightMeters: roofResult?.floorHeightsMeters?.[f.index] ?? f.heightMeters,
      walls: f.walls,
      columns: f.columns,
      stairs: f.stairs,
      fixtures: f.fixtures,
      rooms: cleanRooms(f.rooms, maxW * maxL),
      assumptions: f.assumptions,
      missing: f.missing,
      conflicts: f.conflicts,
    }));

  const floorTag = (f: { index: number; label?: string }) => f.label?.trim() || `Floor ${f.index + 1}`;
  const assembledPlan: MultiFloorBuildingPlan = {
    kind: "multi_floor_building",
    units: "meters",
    bounds: { width: maxW, length: maxL },
    floors: floorsForPlan,
    // If the AI couldn't read the roof, leave it undefined rather than
    // invent a hip roof with an overhang. The exterior walls of the top
    // floor will define the roof outline at zero overhang.
    roof: roofResult?.roof,
    assumptions: floorsForPlan.flatMap((f) => f.assumptions.map((s) => `${floorTag(f)}: ${s}`)),
    missing: floorsForPlan.flatMap((f) => f.missing.map((s) => `${floorTag(f)}: ${s}`)),
    conflicts: floorsForPlan.flatMap((f) => f.conflicts.map((s) => `${floorTag(f)}: ${s}`)),
  };

  const { dae, elementCount, groups: assembledGroups } = buildMultiFloorBuildingDae(assembledPlan, data.outputUnits);
  const { parseDaeToTriangles } = await import("./dae-to-triangles.server");
  const { trianglesToObj, trianglesToFbxAscii, toDataUrl } = await import("./mesh-export.server");
  const { trianglesToGlb, glbToDataUrlBinary } = await import("./glb-export.server");
  const groups = parseDaeToTriangles(dae);
  const assembledValidation = validateMeshGeometry(groups);
  // If the assembled full-building mesh is invalid, skip its export but
  // continue with per-part exports below — any individually valid floor,
  // site, or roof can still ship.
  const assembledValid = assembledValidation.ok;
  if (!assembledValid) {
    console.error(`[assembled] geometry validation failed — skipping combined export: ${assembledValidation.reason}`);
  }
  const daeDataUrl = assembledValid
    ? `data:model/vnd.collada+xml;base64,${Buffer.from(dae, "utf8").toString("base64")}`
    : "";
  const objDataUrl = assembledValid ? toDataUrl(trianglesToObj(groups).obj, "model/obj") : "";
  const fbxDataUrl = assembledValid ? toDataUrl(trianglesToFbxAscii(groups), "application/octet-stream") : "";
  const glbDataUrl = assembledValid
    ? glbToDataUrlBinary(trianglesToGlb(assembledGroups, data.outputUnits))
    : undefined;

  // ── Per-floor exports ──────────────────────────────────────────────
  // Build separate .dae / .obj / .fbx files. The client orchestrates the
  // ordered sequence: Site → Floor 1 → Floor 2 → … → Roof, each as its
  // own request with `scope` set. We honor that scope here and emit ONLY
  // the requested piece so each download is a clean self-contained model
  // sitting at z=0 in SketchUp / Blender.
  const sortedFloorsForParts = [...floorsForPlan].sort((a, b) => a.index - b.index);
  const floorParts: Array<{
    index: number;
    label: string;
    daeDataUrl: string;
    objDataUrl: string;
    fbxDataUrl: string;
    glbDataUrl?: string;
  }> = [];
  const skippedParts: Array<{ label: string; reason: string }> = [];
  const emitPart = (
    index: number,
    label: string,
    plan: MultiFloorBuildingPlan,
    opts: { includeSite?: boolean; includeRoof?: boolean; includeFloors?: boolean; includeInterFloorSlab?: boolean; includeCeiling?: boolean },
  ) => {
    let partDae: string;
    let builtPartGroups: Group[];
    let partGroups: ReturnType<typeof parseDaeToTriangles>;
    try {
      const built = buildMultiFloorBuildingDae(plan, data.outputUnits, opts);
      partDae = built.dae;
      builtPartGroups = built.groups;
      partGroups = parseDaeToTriangles(partDae);
    } catch (err) {
      const reason = err instanceof Error ? err.message : "build/parse failed";
      console.error(`[${label}] geometry build failed — skipping export: ${reason}`);
      skippedParts.push({ label, reason });
      return;
    }
    if (partGroups.length === 0) {
      console.error(`[${label}] empty 3d output — skipping export`);
      skippedParts.push({ label, reason: "no mesh groups" });
      return;
    }
    const validation = validateMeshGeometry(partGroups);
    if (!validation.ok) {
      console.error(`[${label}] geometry validation failed — skipping export: ${validation.reason}`);
      skippedParts.push({ label, reason: validation.reason });
      return;
    }
    const { obj: partObj } = trianglesToObj(partGroups);
    const partFbx = trianglesToFbxAscii(partGroups);
    floorParts.push({
      index,
      label,
      daeDataUrl: `data:model/vnd.collada+xml;base64,${Buffer.from(partDae, "utf8").toString("base64")}`,
      objDataUrl: toDataUrl(partObj, "model/obj"),
      fbxDataUrl: toDataUrl(partFbx, "application/octet-stream"),
      glbDataUrl: glbToDataUrlBinary(trianglesToGlb(builtPartGroups, data.outputUnits)),
    });
  };

  const scope = building.scope;
  if (scope === "site") {
    // Site: ground slab + grass apron over the building footprint.
    const plan: MultiFloorBuildingPlan = {
      kind: "multi_floor_building",
      units: "meters",
      bounds: assembledPlan.bounds,
      floors: [{ ...sortedFloorsForParts[0], index: 0 }],
      assumptions: [], missing: [], conflicts: [],
    };
    emitPart(-1, "Site", plan, { includeSite: true, includeFloors: false, includeRoof: false, includeInterFloorSlab: false });
  } else if (scope === "roof") {
    // Roof-only: the roof slab over the building bounds at z=0.
    const top = sortedFloorsForParts[sortedFloorsForParts.length - 1];
    const plan: MultiFloorBuildingPlan = {
      kind: "multi_floor_building",
      units: "meters",
      bounds: assembledPlan.bounds,
      floors: [{ ...top, index: 0 }],
      roof: assembledPlan.roof ?? { kind: "flat", thicknessMeters: 0.2 },
      assumptions: [], missing: [], conflicts: [],
    };
    emitPart(9999, "Roof", plan, { includeSite: false, includeFloors: false, includeRoof: true, includeInterFloorSlab: false });
  } else if (scope === "floor") {
    // Single floor — no site, no roof bundled. Those come in their own calls.
    for (const f of sortedFloorsForParts) {
      const plan: MultiFloorBuildingPlan = {
        kind: "multi_floor_building",
        units: "meters",
        bounds: assembledPlan.bounds,
        floors: [{ ...f, index: 0 }],
        assumptions: [], missing: [], conflicts: [],
      };
      emitPart(f.index, f.label, plan, { includeSite: false, includeFloors: true, includeRoof: false, includeInterFloorSlab: false, includeCeiling: true });
    }
  } else {
    // Legacy path: ground includes site, top includes roof.
    for (let i = 0; i < sortedFloorsForParts.length; i++) {
      const f = sortedFloorsForParts[i];
      const isGround = i === 0;
      const isTop = i === sortedFloorsForParts.length - 1;
      const plan: MultiFloorBuildingPlan = {
        kind: "multi_floor_building",
        units: "meters",
        bounds: assembledPlan.bounds,
        floors: [{ ...f, index: 0 }],
        roof: isTop ? assembledPlan.roof : undefined,
        assumptions: [], missing: [], conflicts: [],
      };
      emitPart(f.index, f.label, plan, { includeSite: isGround, includeRoof: isTop, includeInterFloorSlab: false, includeCeiling: !isTop });
    }
  }

  if (floorParts.length === 0 && !assembledValid) {
    const detail = skippedParts.length
      ? ` (skipped: ${skippedParts.map((s) => `${s.label} — ${s.reason}`).join("; ")})`
      : "";
    return { ok: false, error: `The drawings were read but no usable 3D geometry could be exported${detail}. Try a clearer cropped floor-plan image with visible walls and dimensions.` };
  }
  if (skippedParts.length) {
    console.warn(`[generateFloor3D] continuing with ${floorParts.length} valid part(s); skipped ${skippedParts.length}: ${skippedParts.map((s) => s.label).join(", ")}`);
  }

  // Return a flattened BuildingPlan stub so the existing client-side
  // summary keeps working. The actual geometry is in the .dae.
  const flat: BuildingPlan = {
    kind: "building",
    units: "meters",
    bounds: { width: assembledPlan.bounds.width, length: assembledPlan.bounds.length },
    walls: assembledPlan.floors.flatMap((f) => f.walls),
    columns: assembledPlan.floors.flatMap((f) => f.columns),
    stairs: assembledPlan.floors.flatMap((f) => f.stairs),
    fixtures: assembledPlan.floors.flatMap((f) => f.fixtures),
    rooms: assembledPlan.floors.flatMap((f) => f.rooms),
    assumptions: assembledPlan.assumptions,
    missing: assembledPlan.missing,
    conflicts: assembledPlan.conflicts,
  };

  const extras = await buildingReportExtras({
    levels: assembledPlan.floors.map((f) => ({
      index: f.index,
      label: f.label?.trim() || `Floor ${f.index + 1}`,
      heightMeters: f.heightMeters,
      walls: f.walls,
      columns: f.columns,
      stairs: f.stairs,
      fixtures: f.fixtures,
      rooms: f.rooms,
    })),
    bounds: assembledPlan.bounds,
    planUnits: data.planUnits,
    scale: (() => {
      const calibrated = floors.find((f) => f.planWidthMeters)?.planWidthMeters;
      return calibrated
        ? { method: "user_calibration" as const, planWidthMeters: calibrated }
        : { method: "printed_dimensions" as const };
    })(),
    assumptions: assembledPlan.assumptions,
    missing: assembledPlan.missing,
    conflicts: assembledPlan.conflicts,
  });

  return {
    ok: true,
    daeDataUrl,
    objDataUrl,
    fbxDataUrl,
    glbDataUrl,
    elementCount,
    subject: "building",
    outputUnits: data.outputUnits,
    plan: flat,
    floorParts,
    ...extras,
  };
}

// Quick bounding-box extractor for the furniture flow. The mesh reconstructor
// (Trellis) returns a normalised unit-cube mesh, which makes the downloaded
// .dae open at the wrong scale in SketchUp. Before reconstruction we read the
// 2D technical sheet for printed width/depth/height (or infer them from a
// reference image when no dimensions are printed) so the .dae imports 1:1.
const FurnitureBoundsInput = z.object({
  fileDataUrl: z
    .string()
    .regex(/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,/)
    .max(2_700_000_000),
  planUnits: PlanUnits.default("meters"),
  referenceImages: z
    .array(z.string().regex(/^data:image\/(png|jpeg|webp);base64,/).max(50_000_000))
    .max(4)
    .default([])
    .optional(),
});

const FurnitureBoundsSchema = z.object({
  width: z.number().positive().max(20),
  depth: z.number().positive().max(20),
  height: z.number().positive().max(20),
});

export const extractFurnitureBounds = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => FurnitureBoundsInput.parse(input))
  .handler(async ({ data }): Promise<
    | { ok: true; width: number; depth: number; height: number }
    | { ok: false; error: string }
  > => {
    const isPdf = data.fileDataUrl.startsWith("data:application/pdf");
    const planUnitNote = data.planUnits === "feet-inches"
      ? "The drawing is dimensioned in feet & inches. Convert every reading to METERS before responding (1 ft = 0.3048 m, 1 in = 0.0254 m)."
      : "The drawing is dimensioned in meters.";
    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `You are reading a technical drawing of ONE furniture piece (top/plan, front and side views, usually with printed dimensions). Return STRICT JSON with the overall bounding box of the piece in METERS:
{"width": <m, left-to-right, X>, "depth": <m, front-to-back, Y>, "height": <m, bottom-to-top, Z>}
Rules:
- ${planUnitNote}
- Prefer printed dimensions. If none are printed, infer realistic furniture scale from the views and any reference photo.
- Use the overall extents of the piece (including legs, base, glides), not a single part.
- Numbers only, no units in the output.`,
      },
      isPdf
        ? { type: "file", file: { filename: "source.pdf", file_data: data.fileDataUrl } }
        : { type: "image_url", image_url: { url: data.fileDataUrl } },
    ];
    for (const url of data.referenceImages ?? []) {
      if (url === data.fileDataUrl) continue;
      userContent.push({ type: "image_url", image_url: { url } });
    }
    const { claudeExtractJson } = await import("./claude.server");
    const extraction = await claudeExtractJson({ parts: userContent, maxTokens: 2000, timeoutMs: 2 * 60 * 1000 });
    if (!extraction.ok) return { ok: false, error: extraction.error };
    let parsed: unknown;
    try {
      parsed = parseJsonFromModelText(extraction.text);
    } catch {
      return { ok: false, error: "The AI response was not valid JSON." };
    }
    const result = FurnitureBoundsSchema.safeParse(parsed);
    if (!result.success) return { ok: false, error: "Dimensions returned by the AI were not valid." };
    return { ok: true, ...result.data };
  });

// ─────────────────────────────────────────────────────────────────────────────
// MARK & LIFT — auto-detect 2D elements, let the user recolor on the canvas,
// then extrude each colored polygon into its own SketchUp-ready 3D group.
// ─────────────────────────────────────────────────────────────────────────────

export const MARK_LIFT_TYPES = ["wall", "door", "window", "column", "stair", "cabinet", "floor", "roof", "fixture"] as const;
export type MarkLiftType = (typeof MARK_LIFT_TYPES)[number];

type MarkLiftSpec = {
  label: string;        // group name in the .dae
  height: number;       // metres
  baseZ: number;        // metres (Z of bottom of the prism)
  color: [number, number, number]; // sRGB 0..1
  hex: string;          // for UI
  material: MaterialId;
  layerName: string;    // numbered export-layer name (LAYER_NAMES)
};

export const MARK_LIFT_SPECS: Record<MarkLiftType, MarkLiftSpec> = {
  wall:    { label: "Walls",    layerName: LAYER_NAMES.wallsExterior, height: 2.7,  baseZ: 0,    color: [0.784, 0.784, 0.784], hex: "#334155", material: "concrete_smooth" },
  door:    { label: "Doors",    layerName: LAYER_NAMES.doors,         height: 2.1,  baseZ: 0,    color: [0.627, 0.322, 0.176], hex: "#A0522D", material: "wood_oak" },
  window:  { label: "Windows",  layerName: LAYER_NAMES.windows,       height: 1.2,  baseZ: 0.9,  color: [0.529, 0.808, 0.922], hex: "#87CEEB", material: "glass_clear" },
  column:  { label: "Columns",  layerName: LAYER_NAMES.columns,       height: 2.7,  baseZ: 0,    color: [0.561, 0.561, 0.561], hex: "#8F8F8F", material: "concrete_smooth" },
  stair:   { label: "Stairs",   layerName: LAYER_NAMES.stairs,        height: 1.5,  baseZ: 0,    color: [0.855, 0.647, 0.125], hex: "#DAA520", material: "concrete_polished" },
  cabinet: { label: "Cabinets", layerName: LAYER_NAMES.millwork,      height: 0.9,  baseZ: 0,    color: [0.871, 0.722, 0.529], hex: "#DEB887", material: "wood_oak" },
  floor:   { label: "Floor",    layerName: LAYER_NAMES.slab,          height: 0.15, baseZ: -0.15, color: [0.545, 0.451, 0.333], hex: "#8B7355", material: "concrete_polished" },
  roof:    { label: "Roof",     layerName: LAYER_NAMES.roof,          height: 0.20, baseZ: 2.7,  color: [0.396, 0.263, 0.129], hex: "#654321", material: "wood_dark" },
  fixture: { label: "Fixtures", layerName: LAYER_NAMES.millwork,      height: 0.9,  baseZ: 0,    color: [0.749, 0.639, 0.486], hex: "#BFA37C", material: "wood_oak" },
};

const DetectInput = z.object({
  imageDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,/)
    .max(50_000_000),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
});

const DetectedPolygon = z.object({
  type: z.enum(MARK_LIFT_TYPES),
  // Points in NORMALISED image coordinates 0..1 (origin top-left, y-down).
  points: z.array(z.tuple([z.number(), z.number()])).min(3).max(200),
  confidence: z.number().min(0).max(1).optional(),
});
const RoomLabelSchema = z.object({
  name: z.string().trim().min(1).max(60),
  at: z.tuple([z.number(), z.number()]),
});
const DetectedSchema = z.object({
  polygons: z.array(DetectedPolygon).max(400),
  roomLabels: z.array(RoomLabelSchema).max(80).default([]),
});

export type DetectedFloorPolygon = z.infer<typeof DetectedPolygon> & { id: string };
export type DetectedRoomLabel = z.infer<typeof RoomLabelSchema>;

export const detectFloorElements = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DetectInput.parse(input))
  .handler(async ({ data }): Promise<
    | { ok: true; polygons: DetectedFloorPolygon[]; roomLabels: DetectedRoomLabel[] }
    | { ok: false; error: string }
  > => {
    const instruction = `You are an architectural drawing recognition AI. Read the uploaded 2D black-line architectural plan and identify each building element correctly. Look at the black lines, shapes, symbols, thicknesses, and enclosed areas — understand what each line represents in real architecture. The goal: only the black-lined boundaries remain, classified and ready to lift into a clean 3D model.
Return STRICT JSON in the exact shape: {"polygons":[{"type":"wall|door|window|column|stair|cabinet|floor|roof|fixture","points":[[x,y],...],"confidence":0..1}, ...], "roomLabels":[{"name":"<room name exactly as printed>","at":[x,y]}, ...]}.
- "roomLabels": READ THE WORDS PRINTED ON THE PLAN. Every room name written on the drawing (LIVING, DINING, KITCHEN, M. BEDROOM, M. BATH, FOYER, LANAI, DEN/OFFICE, LAUNDRY, W.C., POOL BATH…) becomes one entry with the normalized [x,y] center of that printed text. Copy the printed wording exactly; never invent names; skip dimensions, notes and title-block text.

HOW TO RECOGNISE EACH ELEMENT:
- "wall" — thick black lines, double lines, closed wall shapes, long continuous boundaries that form rooms. Trace the filled body of the wall as a thin strip along its thickness, one polygon per wall segment.
- "door" — door openings: swing arcs, door leaf lines, sliding-door symbols, gaps inside walls. Trace the opening rectangle.
- "window" — thin openings inside walls, double-line window symbols, glass panels, repeated narrow rectangles along exterior walls.
- "column" — square, rectangular or circular structural shapes; usually solid black or enclosed shapes inside or near walls, isolated from the wall run.
- "stair" — repeated parallel lines, step patterns, direction arrows, stair labels. Trace the overall stair footprint.
- "cabinet" — thin rectangles attached to walls: counters, closets, shelves, millwork, fixed furniture.
- "floor" — every enclosed area bounded by walls gets a floor polygon; ALWAYS return at least one floor covering the habitable footprint.
- "roof" — roof outline only if the sheet is a roof plan; otherwise omit.
- "fixture" — fixed plumbing and built-ins that are not cabinets (tubs, sinks, WCs, kitchen appliances).

CLASSIFICATION RULES:
- Do NOT treat every black line as a wall. Thick continuous lines are usually walls; thin lines may be symbols, furniture, dimension strings or detail linework.
- Gaps inside walls mean doors, windows or open passages — classify by the symbol (arc = door, double thin lines = window, nothing = open passage → leave as gap, no polygon).
- Text, room labels, measurements and notes are NOT geometry — never convert text into walls. Use dimension text only to understand scale.
- Ignore title blocks, north arrows, legends, hatching — but DO trace the plan itself even when those decorations are visible.
- When unsure what an element is, OMIT it rather than guessing it into the wrong category; reflect doubt in a lower "confidence" value for borderline shapes you do keep.
- Coordinates are NORMALISED 0..1 in the image's own pixel grid (x = left→right, y = top→bottom). Polygons must be SIMPLE (no self-intersections).
- Return ONLY the JSON object, no comments, no markdown.`;

    const { claudeExtractJson } = await import("./claude.server");
    // Model output is occasionally malformed — one retry rescues those runs.
    let lastError = "The AI response was not valid JSON.";
    for (let attempt = 0; attempt < 2; attempt++) {
      const extraction = await claudeExtractJson({
        parts: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: data.imageDataUrl } },
        ],
        timeoutMs: 5 * 60 * 1000,
      });
      if (!extraction.ok) {
        console.error("[mark-lift] detect failed", extraction.status, extraction.error.slice(0, 300));
        if (extraction.status === 401 || extraction.status === 402 || extraction.status === 403) {
          return { ok: false, error: extraction.error };
        }
        lastError = extraction.error;
        continue;
      }
      let parsed: unknown;
      try {
        parsed = parseJsonFromModelText(extraction.text);
      } catch {
        lastError = "The AI response was not valid JSON.";
        continue;
      }
      const result = DetectedSchema.safeParse(parsed);
      if (!result.success) {
        console.error("[mark-lift] detect schema invalid", result.error.issues.slice(0, 5));
        lastError = "Detection returned an invalid shape. Try a clearer image.";
        continue;
      }
      const polygons: DetectedFloorPolygon[] = result.data.polygons.map((p, i) => ({ ...p, id: `det_${i}` }));
      return { ok: true, polygons, roomLabels: result.data.roomLabels };
    }
    return { ok: false, error: lastError };
  });

// ── Lift annotated polygons into a per-type grouped 3D model ────────────────

const LiftPolygon = z.object({
  id: z.string().max(40),
  type: z.enum(MARK_LIFT_TYPES),
  // Normalised 0..1 image coordinates.
  points: z.array(z.tuple([z.number(), z.number()])).min(3).max(400),
});
const LiftInput = z.object({
  label: z.string().max(60).default("Floor"),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
  // Real-world width of the plan in METRES (longer image side maps to this).
  planWidthMeters: z.number().min(1).max(500).default(12),
  outputUnits: z.enum(["meters", "feet"]).default("meters"),
  wallHeightMeters: z.number().min(0.3).max(15).default(2.7),
  polygons: z.array(LiftPolygon).min(1).max(800),
  // Room boundaries (normalized 0..1) with names read from the drawing —
  // vector CAD extraction fills these; they feed the geometry JSON + report.
  rooms: z
    .array(
      z.object({
        name: z.string().max(60).optional(),
        points: z.array(z.tuple([z.number(), z.number()])).min(3).max(400),
      }),
    )
    .max(120)
    .default([]),
  // Where the polygons came from — recorded in the report.
  scaleMethod: z.enum(["printed_dimensions", "user_calibration", "cad_units"]).default("user_calibration"),
});

// Triangulate a simple polygon in 2D (x,y) and build a vertical prism between
// z0 and z1. Side faces wind so the prism is closed and watertight.
function extrudePolygonIntoGroup(
  group: { positions: number[]; indices: number[] },
  poly: Array<[number, number]>,
  z0: number,
  z1: number,
  scale: number,
) {
  if (poly.length < 3) return;
  const flat: number[] = [];
  for (const [x, y] of poly) flat.push(x, y);
  const tris = earcut(flat);
  if (tris.length === 0) return;
  const baseIndex = group.positions.length / 3;
  // Bottom ring
  for (const [x, y] of poly) group.positions.push(x * scale, y * scale, z0 * scale);
  // Top ring
  for (const [x, y] of poly) group.positions.push(x * scale, y * scale, z1 * scale);
  const n = poly.length;
  // Bottom (reversed for outward normal)
  for (let i = 0; i < tris.length; i += 3) {
    group.indices.push(baseIndex + tris[i + 2], baseIndex + tris[i + 1], baseIndex + tris[i]);
  }
  // Top
  for (let i = 0; i < tris.length; i += 3) {
    group.indices.push(baseIndex + n + tris[i], baseIndex + n + tris[i + 1], baseIndex + n + tris[i + 2]);
  }
  // Sides
  for (let i = 0; i < n; i += 1) {
    const a = baseIndex + i;
    const b = baseIndex + ((i + 1) % n);
    const c = baseIndex + n + ((i + 1) % n);
    const d = baseIndex + n + i;
    group.indices.push(a, b, c, a, c, d);
  }
}

export const liftAnnotatedFloor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LiftInput.parse(input))
  .handler(async ({ data }): Promise<GenerateFloor3DResult> => {
    const outputScale = data.outputUnits === "feet" ? 1 / 0.3048 : 1;
    // Image px → metres, longer side maps to planWidthMeters.
    const longer = Math.max(data.imageWidth, data.imageHeight);
    const mPerPx = data.planWidthMeters / longer;
    // The annotator's Y axis is top-down (image coords). Flip Y so the model
    // sits in Z-up world space with +Y "up the page" the way SketchUp expects.
    const toWorld = (pts: Array<[number, number]>): Array<[number, number]> =>
      pts.map(([px, py]) => [px * data.imageWidth * mPerPx, (data.imageHeight - py * data.imageHeight) * mPerPx]);

    // Bucket by type → one group per type.
    const buckets = new Map<MarkLiftType, ReturnType<typeof makeGroupBuilder>>();
    for (const t of MARK_LIFT_TYPES) {
      const spec = MARK_LIFT_SPECS[t];
      buckets.set(t, makeGroupBuilder(`mark_${t}`, spec.layerName, outputScale, spec.material, spec.color));
    }

    // Wall height override applies to walls AND shifts roof baseZ.
    const wallH = data.wallHeightMeters;

    for (const poly of data.polygons) {
      const spec = MARK_LIFT_SPECS[poly.type];
      const world = toWorld(poly.points);
      // Walls and columns rise to the full storey height; everything else
      // keeps its architectural default.
      const height = poly.type === "wall" || poly.type === "column" ? wallH : spec.height;
      const baseZ = poly.type === "roof" ? wallH : spec.baseZ;
      const bucket = buckets.get(poly.type)!;
      extrudePolygonIntoGroup(bucket.group, world, baseZ, baseZ + height, outputScale);
    }

    const groups: Group[] = [];
    for (const t of MARK_LIFT_TYPES) {
      const b = buckets.get(t)!;
      if (b.group.positions.length) {
        b.group.parentPath = [data.label.trim() || "Floor"];
        groups.push(b.group);
      }
    }

    if (groups.length === 0) {
      return { ok: false, error: "No polygons could be lifted into 3D." };
    }

    const dae = emitDaeFromGroups(groups, data.outputUnits);
    const { parseDaeToTriangles } = await import("./dae-to-triangles.server");
    const { trianglesToObj, trianglesToFbxAscii, toDataUrl } = await import("./mesh-export.server");
    const tris = parseDaeToTriangles(dae);
    const validation = validateMeshGeometry(tris);
    if (!validation.ok) {
      return { ok: false, error: `Lift produced an empty mesh (${validation.reason}).` };
    }
    const { obj } = trianglesToObj(tris);
    const fbx = trianglesToFbxAscii(tris);
    const { trianglesToGlb, glbToDataUrlBinary } = await import("./glb-export.server");
    const glbDataUrl = glbToDataUrlBinary(trianglesToGlb(groups, data.outputUnits));
    const daeDataUrl = `data:model/vnd.collada+xml;base64,${Buffer.from(dae, "utf8").toString("base64")}`;
    const objDataUrl = toDataUrl(obj, "model/obj");
    const fbxDataUrl = toDataUrl(fbx, "application/octet-stream");
    const elementCount = data.polygons.length;
    const floorPart = {
      index: 0,
      label: data.label.trim() || "Floor",
      daeDataUrl,
      objDataUrl,
      fbxDataUrl,
      glbDataUrl,
    };
    // Rooms from vector extraction (or user annotation) — world meters, into
    // the geometry JSON + report. Named rooms were read straight from the
    // drawing text, so they're "confirmed"; unnamed ones are "inferred".
    const worldRooms = (data.rooms ?? []).map((room) => ({
      name: room.name,
      boundary: toWorld(room.points),
      confidence: (room.name ? "confirmed" : "inferred") as ElementConfidence,
    }));
    const extras = await buildingReportExtras({
      levels: [{
        index: 0,
        label: data.label.trim() || "Floor",
        heightMeters: wallH,
        walls: [],
        columns: [],
        stairs: [],
        fixtures: [],
        rooms: worldRooms,
      }],
      bounds: { width: data.imageWidth * mPerPx, length: data.imageHeight * mPerPx },
      planUnits: "meters",
      scale: { method: data.scaleMethod, planWidthMeters: data.planWidthMeters },
      assumptions: [
        `Wall height ${wallH.toFixed(2)} m applied uniformly — lifted from 2D boundaries.`,
        ...(data.scaleMethod === "cad_units" ? ["Scale read from CAD drawing units (INSUNITS)."] : []),
      ],
      missing: [],
      conflicts: [],
    });

    // Minimal "plan" payload so the existing client paths that read .plan
    // do not crash; the rich plan model is not needed for mark-and-lift.
    const fauxPlan = {
      kind: "building" as const,
      bounds: { width: data.imageWidth * mPerPx, length: data.imageHeight * mPerPx, height: wallH },
      walls: [],
      columns: [],
      stairs: [],
      fixtures: [],
      rooms: worldRooms,
    } as unknown as BuildingPlan;
    return {
      ok: true,
      daeDataUrl,
      objDataUrl,
      fbxDataUrl,
      glbDataUrl,
      elementCount,
      subject: "building",
      outputUnits: data.outputUnits,
      plan: fauxPlan,
      floorParts: [floorPart],
      ...extras,
    };
  });