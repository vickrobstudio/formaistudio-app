/**
 * Structured geometry export ("formai.geometry/1") and the human-readable
 * assumptions report. Pure — built entirely from the already-extracted plan,
 * no AI calls. Object ids follow the architectural naming convention
 * WALL_L01_001 / DOOR_L01_001 / ROOM_L01_kitchen_001 so the JSON can drive
 * BIM-style downstream tooling.
 */

export type ElementConfidence = "confirmed" | "inferred" | "assumed";

type WallIn = {
  name?: string;
  layer: "exterior" | "interior";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  height?: number;
  material: string;
  confidence: ElementConfidence;
  openings: Array<{
    kind: "door" | "window";
    position: number;
    width: number;
    sillHeight: number;
    headHeight: number;
    confidence: ElementConfidence;
  }>;
};

type BoxIn = {
  name?: string;
  cx: number;
  cy: number;
  width: number;
  depth: number;
  height: number;
  rotationDegZ: number;
  material: string;
  confidence: ElementConfidence;
};

export type GeometryJsonInput = {
  levels: Array<{
    index: number;
    label: string;
    heightMeters: number;
    walls: WallIn[];
    columns: BoxIn[];
    stairs: Array<BoxIn & { steps: number }>;
    fixtures: Array<Omit<BoxIn, "cx"> & { cx: number; cz: number; layer: string }>;
    rooms: Array<{
      name?: string;
      boundary: Array<[number, number]>;
      confidence: ElementConfidence;
    }>;
  }>;
  bounds: { width: number; length: number };
  planUnits: "feet-inches" | "meters";
  scale: ScaleSource;
  assumptions: string[];
  missing: string[];
  conflicts: string[];
};

export type ScaleSource = {
  method: "printed_dimensions" | "user_calibration" | "cad_units";
  planWidthMeters?: number;
};

export type GeometryObject = {
  id: string;
  category: "wall" | "door" | "window" | "room" | "column" | "stair" | "fixture";
  level: string;
  name?: string;
  geometry: Record<string, unknown>;
  material?: string;
  layer?: string;
  hostWall?: string;
  openings?: string[];
  confidence: ElementConfidence;
  source: "ai_extraction";
};

export type GeometryJson = {
  schema: "formai.geometry/1";
  generatedAt: string;
  units: "meters";
  source: {
    planUnits: "feet-inches" | "meters";
    scale: ScaleSource;
  };
  bounds: { width: number; length: number };
  levels: Array<{
    id: string;
    index: number;
    label: string;
    elevationMeters: number;
    heightMeters: number;
  }>;
  objects: GeometryObject[];
  assumptions: string[];
  missing: string[];
  conflicts: string[];
};

export function polygonAreaM2(boundary: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 0; i < boundary.length; i++) {
    const [x1, y1] = boundary[i];
    const [x2, y2] = boundary[(i + 1) % boundary.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function slug(name: string | undefined): string {
  const s = (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s.slice(0, 24);
}

export function buildGeometryJson(input: GeometryJsonInput): GeometryJson {
  const objects: GeometryObject[] = [];
  const levels: GeometryJson["levels"] = [];
  let elevation = 0;

  for (const lvl of [...input.levels].sort((a, b) => a.index - b.index)) {
    const levelId = `L${String(lvl.index + 1).padStart(2, "0")}`;
    levels.push({
      id: levelId,
      index: lvl.index,
      label: lvl.label,
      elevationMeters: Number(elevation.toFixed(3)),
      heightMeters: lvl.heightMeters,
    });

    // Per-category, per-level counters keep ids stable and readable.
    const counters = new Map<string, number>();
    const nextId = (category: string, nameSlug?: string) => {
      const key = `${category}_${nameSlug ?? ""}`;
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      const mid = nameSlug ? `_${nameSlug}` : "";
      return `${category.toUpperCase()}_${levelId}${mid}_${String(n).padStart(3, "0")}`;
    };

    for (const wall of lvl.walls) {
      const wallId = nextId("wall");
      const openingIds: string[] = [];
      for (const op of wall.openings) {
        const opId = nextId(op.kind);
        openingIds.push(opId);
        objects.push({
          id: opId,
          category: op.kind,
          level: levelId,
          hostWall: wallId,
          geometry: {
            positionAlongWall: op.position,
            width: op.width,
            sillHeight: op.sillHeight,
            headHeight: op.headHeight,
          },
          confidence: op.confidence,
          source: "ai_extraction",
        });
      }
      objects.push({
        id: wallId,
        category: "wall",
        level: levelId,
        name: wall.name,
        layer: wall.layer,
        geometry: {
          start: [wall.x1, wall.y1],
          end: [wall.x2, wall.y2],
          thickness: wall.thickness,
          height: wall.height ?? lvl.heightMeters,
          baseZ: Number(elevation.toFixed(3)),
        },
        material: wall.material,
        openings: openingIds,
        confidence: wall.confidence,
        source: "ai_extraction",
      });
    }

    for (const room of lvl.rooms) {
      objects.push({
        id: nextId("room", slug(room.name) || undefined),
        category: "room",
        level: levelId,
        name: room.name,
        geometry: {
          boundary: room.boundary,
          areaM2: Number(polygonAreaM2(room.boundary).toFixed(2)),
        },
        confidence: room.confidence,
        source: "ai_extraction",
      });
    }

    for (const col of lvl.columns) {
      objects.push({
        id: nextId("column"),
        category: "column",
        level: levelId,
        name: col.name,
        geometry: {
          center: [col.cx, col.cy],
          width: col.width,
          depth: col.depth,
          height: col.height,
          rotationDegZ: col.rotationDegZ,
        },
        material: col.material,
        confidence: col.confidence,
        source: "ai_extraction",
      });
    }

    for (const stair of lvl.stairs) {
      objects.push({
        id: nextId("stair"),
        category: "stair",
        level: levelId,
        name: stair.name,
        geometry: {
          center: [stair.cx, stair.cy],
          width: stair.width,
          depth: stair.depth,
          height: stair.height,
          steps: stair.steps,
          rotationDegZ: stair.rotationDegZ,
        },
        material: stair.material,
        confidence: stair.confidence,
        source: "ai_extraction",
      });
    }

    for (const fix of lvl.fixtures) {
      objects.push({
        id: nextId("fixture", slug(fix.layer) || undefined),
        category: "fixture",
        level: levelId,
        name: fix.name,
        layer: fix.layer,
        geometry: {
          center: [fix.cx, fix.cy, fix.cz],
          width: fix.width,
          depth: fix.depth,
          height: fix.height,
          rotationDegZ: fix.rotationDegZ,
        },
        material: fix.material,
        confidence: fix.confidence,
        source: "ai_extraction",
      });
    }

    elevation += lvl.heightMeters;
  }

  return {
    schema: "formai.geometry/1",
    generatedAt: new Date().toISOString(),
    units: "meters",
    source: { planUnits: input.planUnits, scale: input.scale },
    bounds: input.bounds,
    levels,
    objects,
    assumptions: input.assumptions,
    missing: input.missing,
    conflicts: input.conflicts,
  };
}

export function buildAssumptionsMarkdown(json: GeometryJson): string {
  const counts: Record<ElementConfidence, number> = { confirmed: 0, inferred: 0, assumed: 0 };
  for (const obj of json.objects) counts[obj.confidence]++;

  const lines: string[] = [
    "# Extraction Report",
    "",
    `Generated: ${json.generatedAt}`,
    `Units: ${json.units} (drawing units: ${json.source.planUnits})`,
    json.source.scale.method === "user_calibration"
      ? `Scale: user calibration — plan width ${json.source.scale.planWidthMeters?.toFixed(2)} m`
      : "Scale: read from printed dimensions",
    `Plan bounds: ${json.bounds.width.toFixed(2)} m × ${json.bounds.length.toFixed(2)} m`,
    "",
    "## Element confidence",
    "",
    `- CONFIRMED: ${counts.confirmed}`,
    `- INFERRED: ${counts.inferred}`,
    `- ASSUMED: ${counts.assumed}`,
    "",
  ];

  for (const lvl of json.levels) {
    const objs = json.objects.filter((o) => o.level === lvl.id);
    const byCat = new Map<string, number>();
    for (const o of objs) byCat.set(o.category, (byCat.get(o.category) ?? 0) + 1);
    const summary = [...byCat.entries()]
      .map(([c, n]) => `${n} ${c}${n === 1 ? "" : "s"}`)
      .join(", ");
    lines.push(
      `### ${lvl.id} — ${lvl.label} (elev ${lvl.elevationMeters} m, height ${lvl.heightMeters} m)`,
      "",
      summary || "no elements",
      "",
    );
  }

  const section = (title: string, items: string[]) => {
    lines.push(`## ${title}`, "");
    if (items.length === 0) lines.push("None.", "");
    else {
      for (const item of items) lines.push(`- ${item}`);
      lines.push("");
    }
  };
  section("Assumptions", json.assumptions);
  section("Missing information", json.missing);
  section("Conflicts", json.conflicts);

  const lowConfidence = json.objects.filter((o) => o.confidence === "assumed");
  if (lowConfidence.length) {
    lines.push("## Assumed elements", "");
    for (const o of lowConfidence) lines.push(`- ${o.id}${o.name ? ` (${o.name})` : ""}`);
    lines.push("");
  }

  return lines.join("\n");
}
