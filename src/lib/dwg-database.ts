// Vector DWG / DXF database reader.
//
// Loads the LibreDwg WASM module (compiled from the libredwg C library)
// and parses a DWG or DXF file into a structured, in-memory database.
// No rasterization. Vector precision is preserved end-to-end so the BIM
// pipeline (wall network, room polygons, elevations) can reason on the
// real coordinates that the drafter authored.
//
// The WASM binary is served from /wasm/libredwg-web.wasm (public/wasm/).

import { LibreDwg, Dwg_File_Type, type DwgDatabase } from "@mlightcad/libredwg-web";

export type DwgEntityLite = {
  id: number;
  handle?: string;
  type: string;        // libredwg numeric type, kept as string for switch friendliness
  layer: string;
  colorIndex?: number;
  // A normalized vector payload. Only the fields relevant to the entity
  // kind are populated; everything else is left undefined so consumers
  // can pattern-match on `type`.
  start?: { x: number; y: number; z?: number };
  end?: { x: number; y: number; z?: number };
  center?: { x: number; y: number; z?: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  vertices?: Array<{ x: number; y: number; bulge?: number }>;
  closed?: boolean;
  text?: string;
  insertionPoint?: { x: number; y: number; z?: number };
  blockName?: string;
  rotation?: number;
  scale?: { x: number; y: number; z?: number };
  lineType?: string;
  viewportCenter?: { x: number; y: number; z?: number };
  majorAxisEndPoint?: { x: number; y: number; z?: number };
  displayCenter?: { x: number; y: number; z?: number };
  targetPoint?: { x: number; y: number; z?: number };
  width?: number;
  height?: number;
  viewHeight?: number;
  viewTwistAngle?: number;
  status?: number;
  statusBitFlags?: number;
  axisRatio?: number;
};

export type DwgLayerLite = {
  name: string;
  colorIndex?: number;
  frozen?: boolean;
  locked?: boolean;
  on?: boolean;
  lineType?: string;
};

export type DwgBlockLite = {
  name: string;
  base: { x: number; y: number; z?: number };
  entityCount: number;
  entities?: DwgEntityLite[];
};

export type DwgUnits =
  | "unitless" | "inches" | "feet" | "miles"
  | "millimeters" | "centimeters" | "meters" | "kilometers"
  | "microinches" | "mils" | "yards" | "angstroms"
  | "nanometers" | "microns" | "decimeters" | "decameters"
  | "hectometers" | "gigameters" | "astronomical" | "lightyears" | "parsecs";

const UNIT_MAP: Record<number, DwgUnits> = {
  0: "unitless", 1: "inches", 2: "feet", 3: "miles",
  4: "millimeters", 5: "centimeters", 6: "meters", 7: "kilometers",
  8: "microinches", 9: "mils", 10: "yards", 11: "angstroms",
  12: "nanometers", 13: "microns", 14: "decimeters", 15: "decameters",
  16: "hectometers", 17: "gigameters", 18: "astronomical", 19: "lightyears", 20: "parsecs",
};

export type DwgDatabaseLite = {
  source: "dwg" | "dxf";
  units: DwgUnits;
  /** INSUNITS scale to meters (best-effort). */
  unitToMeters: number;
  /** Drawing extents in drawing units (model space). */
  extents: { min: { x: number; y: number }; max: { x: number; y: number } };
  layers: DwgLayerLite[];
  blocks: DwgBlockLite[];
  entities: DwgEntityLite[];
  /** One entry per AutoCAD layout (Model + each paper-space tab). */
  layouts: DwgLayoutLite[];
  /** Original DwgDatabase for advanced consumers. */
  raw: DwgDatabase;
};

export type DwgLayoutLite = {
  name: string;
  isModelSpace: boolean;
  entities: DwgEntityLite[];
};

const UNIT_TO_METERS: Record<DwgUnits, number> = {
  unitless: 1, inches: 0.0254, feet: 0.3048, miles: 1609.344,
  millimeters: 0.001, centimeters: 0.01, meters: 1, kilometers: 1000,
  microinches: 2.54e-8, mils: 2.54e-5, yards: 0.9144, angstroms: 1e-10,
  nanometers: 1e-9, microns: 1e-6, decimeters: 0.1, decameters: 10,
  hectometers: 100, gigameters: 1e9, astronomical: 1.496e11,
  lightyears: 9.461e15, parsecs: 3.086e16,
};

let libreDwgPromise: Promise<LibreDwg> | null = null;
function getLibreDwg(): Promise<LibreDwg> {
  if (!libreDwgPromise) {
    // `/wasm` resolves to /public/wasm/libredwg-web.wasm at runtime.
    libreDwgPromise = LibreDwg.create("/wasm");
  }
  return libreDwgPromise;
}

function detectKind(file: File): "dwg" | "dxf" {
  return /\.dxf$/i.test(file.name) ? "dxf" : "dwg";
}

/**
 * Parse a DWG or DXF file in the browser, with no rasterization.
 * Returns a normalized database plus the raw libredwg DwgDatabase.
 */
export async function parseDrawing(file: File): Promise<DwgDatabaseLite> {
  const kind = detectKind(file);
  const libredwg = await getLibreDwg();

  let dwgHandle: number | null | undefined;
  let db: DwgDatabase;

  if (kind === "dxf") {
    // DXF is ASCII; libredwg accepts the text payload.
    const text = await file.text();
    dwgHandle = libredwg.dwg_read_data(text, Dwg_File_Type.DXF);
    // libredwg's DXF importer is strict and rejects many simple or
    // loosely-written DXF exports (online converters, hand exports).
    // Fall back to the tolerant dxf-parser adapter for those.
    if (!dwgHandle) return await parseDxfTolerant(text);
    db = libredwg.convert(dwgHandle);
    try {
      const normalized = normalize(db, kind);
      if (normalized.entities.length > 0) return normalized;
      return await parseDxfTolerant(text);
    } finally {
      try { libredwg.dwg_free(dwgHandle); } catch { /* noop */ }
    }
  } else {
    const buf = await file.arrayBuffer();
    dwgHandle = libredwg.dwg_read_data(buf, Dwg_File_Type.DWG);
    if (!dwgHandle) throw new Error("Could not parse DWG file. The file may be corrupted or use an unsupported AutoCAD version.");
    db = libredwg.convert(dwgHandle);
  }

  try {
    return normalize(db, kind);
  } finally {
    if (dwgHandle != null) {
      try { libredwg.dwg_free(dwgHandle); } catch { /* noop */ }
    }
  }
}

/**
 * Tolerant DXF fallback. Adapts `dxf-parser` output (which accepts files
 * libredwg rejects) to the same lite database, so the entire downstream
 * pipeline — rasterization, vector recognition, 3D lift — works unchanged.
 * Files that rely on blocks/INSERTs still need the strict parser.
 */
async function parseDxfTolerant(text: string): Promise<DwgDatabaseLite> {
  const { default: DxfParser } = await import("dxf-parser");
  const parser = new DxfParser();
  type ParsedDxf = { header?: Record<string, unknown>; entities?: Array<Record<string, unknown>> };
  let dxf: ParsedDxf | null = null;
  try {
    dxf = parser.parseSync(text) as ParsedDxf | null;
  } catch {
    throw new Error("Could not parse DXF file.");
  }
  if (!dxf || !Array.isArray(dxf.entities) || dxf.entities.length === 0) {
    throw new Error("Could not parse DXF file.");
  }
  const insunits = Number(dxf.header?.["$INSUNITS"] ?? 0);
  const units = UNIT_MAP[insunits] ?? "unitless";

  type P = { x: number; y: number; bulge?: number };
  const entities: DwgEntityLite[] = [];
  let id = 0;
  for (const raw of dxf.entities) {
    const e = raw as Record<string, any>;
    const type = String(e.type ?? "").toUpperCase();
    const layer = typeof e.layer === "string" ? e.layer : "0";
    if (type === "LINE") {
      const v: P[] = Array.isArray(e.vertices) ? e.vertices : [];
      const start = v[0] ?? e.start;
      const end = v[1] ?? e.end;
      if (!start || !end) continue;
      entities.push({ id: id++, type, layer, start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } });
    } else if (type === "LWPOLYLINE" || type === "POLYLINE") {
      const v: P[] = Array.isArray(e.vertices) ? e.vertices : [];
      if (v.length < 2) continue;
      entities.push({ id: id++, type: "LWPOLYLINE", layer, vertices: v.map((p) => ({ x: p.x, y: p.y, bulge: p.bulge })), closed: Boolean(e.shape ?? e.closed) });
    } else if (type === "CIRCLE" || type === "ARC") {
      if (!e.center || typeof e.radius !== "number") continue;
      entities.push({ id: id++, type, layer, center: { x: e.center.x, y: e.center.y }, radius: e.radius, startAngle: e.startAngle, endAngle: e.endAngle });
    } else if (type === "ELLIPSE") {
      if (!e.center) continue;
      entities.push({ id: id++, type, layer, center: { x: e.center.x, y: e.center.y }, majorAxisEndPoint: e.majorAxisEndPoint, axisRatio: e.axisRatio, startAngle: e.startAngle, endAngle: e.endAngle });
    } else if (type === "TEXT" || type === "MTEXT") {
      const p = e.startPoint ?? e.position;
      const textValue = typeof e.text === "string" ? e.text : "";
      if (!p || !textValue) continue;
      entities.push({ id: id++, type, layer, text: textValue, insertionPoint: { x: p.x, y: p.y }, height: e.textHeight ?? e.height });
    }
  }
  if (!entities.length) throw new Error("Could not parse DXF file.");

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const seen = (p?: { x: number; y: number }) => {
    if (!p) return;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  };
  for (const e of entities) {
    seen(e.start); seen(e.end); seen(e.insertionPoint);
    if (e.center && typeof e.radius === "number") {
      seen({ x: e.center.x - e.radius, y: e.center.y - e.radius });
      seen({ x: e.center.x + e.radius, y: e.center.y + e.radius });
    } else {
      seen(e.center);
    }
    for (const v of e.vertices ?? []) seen(v);
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }

  return {
    source: "dxf",
    units,
    unitToMeters: UNIT_TO_METERS[units] ?? 1,
    extents: { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } },
    layers: [],
    blocks: [],
    entities,
    layouts: [{ name: "Model", isModelSpace: true, entities }],
    raw: dxf as unknown as DwgDatabase,
  };
}

function pt(p: unknown): { x: number; y: number; z?: number } | undefined {
  if (!p || typeof p !== "object") return undefined;
  const o = p as Record<string, unknown>;
  const x = typeof o.x === "number" ? o.x : undefined;
  const y = typeof o.y === "number" ? o.y : undefined;
  const z = typeof o.z === "number" ? o.z : undefined;
  if (x == null || y == null) return undefined;
  return z != null ? { x, y, z } : { x, y };
}

function valueOf(o: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (o[name] != null) return o[name];
  }
  return undefined;
}

function numberOf(o: Record<string, unknown>, ...names: string[]): number | undefined {
  const value = valueOf(o, ...names);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalize(db: DwgDatabase, source: "dwg" | "dxf"): DwgDatabaseLite {
  const header = (db.header ?? {}) as Record<string, unknown>;
  const insunits = typeof header.INSUNITS === "number" ? (header.INSUNITS as number) : 0;
  const units = UNIT_MAP[insunits] ?? "unitless";

  const extmin = pt(header.EXTMIN) ?? { x: 0, y: 0 };
  const extmax = pt(header.EXTMAX) ?? { x: 0, y: 0 };

  const layerEntries = db.tables?.LAYER?.entries ?? [];
  const layers: DwgLayerLite[] = layerEntries.map((l) => {
    const r = l as unknown as Record<string, unknown>;
    return {
      name: String(r.name ?? ""),
      colorIndex: typeof r.colorIndex === "number" ? (r.colorIndex as number) : undefined,
      frozen: Boolean(r.isFrozen ?? r.frozen),
      locked: Boolean(r.isLocked ?? r.locked),
      on: r.isOff != null ? !r.isOff : r.off != null ? !r.off : true,
      lineType: typeof r.lineType === "string" ? (r.lineType as string) : undefined,
    };
  });

  const blockEntries = db.tables?.BLOCK_RECORD?.entries ?? [];
  const blocks: DwgBlockLite[] = blockEntries.map((b) => {
    const r = b as unknown as Record<string, unknown>;
    const blockEntities = Array.isArray(r.entities)
      ? (r.entities as unknown[]).map((e, i) => normalizeEntity(e as Record<string, unknown>, i))
      : [];
    return {
      name: String(r.name ?? ""),
      base: pt(r.basePoint) ?? { x: 0, y: 0 },
      entityCount: blockEntities.length,
      entities: blockEntities,
    };
  });

  let entities: DwgEntityLite[] = (db.entities ?? []).map((e, i) =>
    normalizeEntity(e as unknown as Record<string, unknown>, i),
  );
  // DWG files frequently keep ALL model-space entities inside the
  // `*Model_Space` block record and leave the top-level list empty —
  // without this harvest the whole drawing looks blank.
  if (entities.length === 0) {
    const modelBlock = blocks.find((b) => /^\*model[_ ]?space$/i.test(b.name));
    if (modelBlock?.entities?.length) entities = modelBlock.entities;
  }

  // Extract per-layout entity buckets. Model space is `db.entities`;
  // every other layout lives inside a BLOCK_RECORD whose `layout` handle
  // links to a LAYOUT object (which carries the human "Layout1" name).
  const layoutObjs = (db.objects?.LAYOUT ?? []) as Array<{ handle?: string; layoutName?: string; paperSpaceTableId?: string }>;
  const layoutByHandle = new Map<string, string>();
  const layoutByBlockHandle = new Map<string, string>();
  for (const lo of layoutObjs) {
    if (lo.handle && lo.layoutName) layoutByHandle.set(String(lo.handle), String(lo.layoutName));
    if (lo.paperSpaceTableId && lo.layoutName) layoutByBlockHandle.set(String(lo.paperSpaceTableId), String(lo.layoutName));
  }
  const layouts: DwgLayoutLite[] = [];
  // Model space first, always.
  layouts.push({ name: "Model", isModelSpace: true, entities });
  for (const br of blockEntries) {
    const rec = br as unknown as Record<string, unknown>;
    const name = String(rec.name ?? "");
    if (!name || /^\*model[_ ]?space$/i.test(name)) continue;
    if (!/^\*paper[_ ]?space/i.test(name)) continue;
    const layoutHandle = typeof rec.layout === "string" ? rec.layout : "";
    const blockHandle = typeof rec.handle === "string" ? rec.handle : "";
    const human = (blockHandle && layoutByBlockHandle.get(blockHandle)) || (layoutHandle && layoutByHandle.get(layoutHandle)) || name.replace(/^\*/, "");
    const ents = Array.isArray(rec.entities) ? (rec.entities as unknown[]) : [];
    const lite = ents.map((e, i) => normalizeEntity(e as Record<string, unknown>, i));
    if (lite.length > 0) layouts.push({ name: human, isModelSpace: false, entities: lite });
  }

  return {
    source,
    units,
    unitToMeters: UNIT_TO_METERS[units] ?? 1,
    extents: { min: { x: extmin.x, y: extmin.y }, max: { x: extmax.x, y: extmax.y } },
    layers,
    blocks,
    entities,
    layouts,
    raw: db,
  };
}

function normalizeEntity(e: Record<string, unknown>, i: number): DwgEntityLite {
  const type = normalizeEntityType(e.type ?? e.entityType);
  const layer = String(e.layer ?? "0");
  const colorIndex = typeof e.colorIndex === "number" ? (e.colorIndex as number) : undefined;

  const base: DwgEntityLite = { id: i, type, layer, colorIndex };
  if (typeof e.handle === "string") base.handle = e.handle;
  if (typeof e.lineType === "string") base.lineType = e.lineType as string;

  switch (type.toUpperCase()) {
    case "LINE":
      base.start = pt(valueOf(e, "startPoint", "start", "point"));
      base.end = pt(valueOf(e, "endPoint", "end", "secondPoint"));
      break;
    case "CIRCLE":
      base.center = pt(e.center);
      base.radius = typeof e.radius === "number" ? (e.radius as number) : undefined;
      break;
    case "ARC":
      base.center = pt(e.center);
      base.radius = typeof e.radius === "number" ? (e.radius as number) : undefined;
      base.startAngle = typeof e.startAngle === "number" ? (e.startAngle as number) : undefined;
      base.endAngle = typeof e.endAngle === "number" ? (e.endAngle as number) : undefined;
      break;
    case "LWPOLYLINE":
    case "POLYLINE":
    case "POLYLINE2D":
    case "POLYLINE3D":
    case "SPLINE":
    case "MLINE": {
      const verts = Array.isArray(e.vertices) ? (e.vertices as unknown[]) : [];
      const fitPoints = Array.isArray(e.fitPoints) ? (e.fitPoints as unknown[]) : [];
      const controlPoints = Array.isArray(e.controlPoints) ? (e.controlPoints as unknown[]) : [];
      const rawPoints = type.toUpperCase() === "SPLINE" ? (fitPoints.length > 0 ? fitPoints : controlPoints) : verts;
      base.vertices = rawPoints.map((v) => {
        const r = (v ?? {}) as Record<string, unknown>;
        const p = pt(r.vertex) ?? pt(r);
        return {
          x: p?.x ?? 0,
          y: p?.y ?? 0,
          bulge: typeof r.bulge === "number" ? (r.bulge as number) : undefined,
        };
      });
      const flags = numberOf(e, "flags", "flag") ?? 0;
      base.closed = Boolean(e.isClosed ?? e.closed ?? ((flags & 1) || (flags & 2)));
      break;
    }
    case "ELLIPSE":
      base.center = pt(e.center);
      base.majorAxisEndPoint = pt(e.majorAxisEndPoint);
      base.axisRatio = typeof e.axisRatio === "number" ? (e.axisRatio as number) : undefined;
      base.startAngle = typeof e.startAngle === "number" ? (e.startAngle as number) : undefined;
      base.endAngle = typeof e.endAngle === "number" ? (e.endAngle as number) : undefined;
      break;
    case "TEXT":
    case "MTEXT":
      base.text = typeof e.text === "string" ? (e.text as string) : "";
      base.insertionPoint = pt(e.insertionPoint) ?? pt(e.startPoint);
      base.rotation = typeof e.rotation === "number" ? (e.rotation as number) : undefined;
      break;
    case "INSERT":
      base.blockName = typeof e.name === "string" ? (e.name as string) : "";
      base.insertionPoint = pt(valueOf(e, "insertionPoint", "insertPoint", "basePoint"));
      base.rotation = numberOf(e, "rotation", "angle");
      base.scale = pt(e.scale) ?? {
        x: numberOf(e, "xScale", "scaleX") ?? 1,
        y: numberOf(e, "yScale", "scaleY") ?? 1,
        z: numberOf(e, "zScale", "scaleZ") ?? 1,
      };
      break;
    case "VIEWPORT":
      base.viewportCenter = pt(valueOf(e, "viewportCenter", "center", "centerPoint"));
      base.displayCenter = pt(valueOf(e, "displayCenter", "viewCenter", "viewTarget"));
      base.targetPoint = pt(valueOf(e, "targetPoint", "target"));
      base.width = numberOf(e, "width", "viewportWidth");
      base.height = numberOf(e, "height", "viewportHeight");
      base.viewHeight = numberOf(e, "viewHeight", "viewSize");
      base.viewTwistAngle = numberOf(e, "viewTwistAngle", "twistAngle");
      base.status = numberOf(e, "status");
      base.statusBitFlags = numberOf(e, "statusBitFlags", "flags", "flag");
      break;
    default:
      // Keep unknown entities in the list so consumers can decide what to do.
      break;
  }

  return base;
}

function normalizeEntityType(value: unknown): string {
  const raw = String(value ?? "UNKNOWN");
  const upper = raw.toUpperCase().replace(/^TYPE_/, "").replace(/^DWG_TYPE_/, "").replace(/_R11$/, "");
  if (upper !== raw.toUpperCase()) return upper;

  // LibreDWG frequently exposes DWG entity types as numeric constants.
  // Convert the common architectural entity codes to the names the preview
  // renderer understands; otherwise the upload produced a blank white PNG.
  const code = typeof value === "number" ? value : /^\d+$/.test(raw) ? Number(raw) : NaN;
  const acDbMap: Record<number, string> = {
    1: "TEXT",
    2: "ATTRIB",
    3: "ATTDEF",
    7: "INSERT",
    8: "INSERT",
    15: "POLYLINE2D",
    16: "POLYLINE3D",
    17: "ARC",
    18: "CIRCLE",
    19: "LINE",
    20: "DIMENSION",
    21: "DIMENSION",
    22: "DIMENSION",
    23: "DIMENSION",
    24: "DIMENSION",
    25: "DIMENSION",
    26: "DIMENSION",
    27: "POINT",
    28: "3DFACE",
    31: "SOLID",
    32: "SOLID",
    34: "VIEWPORT",
    35: "ELLIPSE",
    36: "SPLINE",
    40: "LINE",
    41: "LINE",
    44: "MTEXT",
    45: "LEADER",
    47: "MLINE",
    77: "LWPOLYLINE",
    78: "HATCH",
  };
  return acDbMap[code] ?? upper;
}

/** Quick summary used in toasts / debug panes. */
export function summarize(db: DwgDatabaseLite): string {
  const w = Math.max(0, db.extents.max.x - db.extents.min.x);
  const h = Math.max(0, db.extents.max.y - db.extents.min.y);
  return `${db.source.toUpperCase()} · ${db.entities.length} entities · ${db.layers.length} layers · ${db.blocks.length} blocks · ${w.toFixed(1)}×${h.toFixed(1)} ${db.units}`;
}

/**
 * Strict pre-check before we accept a DWG/DXF for the 2D→3D pipeline.
 * The pipeline needs a CLEAN line drawing — no text, no dimensions, no
 * dashed reference lines, no hatches/leaders. Anything else confuses
 * flood-fill room detection. We count the noise; if any category is
 * present we report exactly what to remove.
 */
export type DwgPrecheckIssue = {
  category: "text" | "dimension" | "leader" | "hatch" | "block_insert" | "dashed_line";
  count: number;
};

const DASHED_LT_RE = /(dash|hidden|center|phantom|dot|break|gap|divide)/i;

function isNoiseType(t: string): DwgPrecheckIssue["category"] | null {
  const u = t.toUpperCase();
  if (u === "TEXT" || u === "MTEXT" || u === "ATTDEF" || u === "ATTRIB") return "text";
  if (u === "DIMENSION" || u.startsWith("DIM")) return "dimension";
  if (u === "LEADER" || u === "MLEADER" || u === "MULTILEADER") return "leader";
  if (u === "HATCH" || u === "SOLID") return "hatch";
  if (u === "INSERT") return "block_insert";
  return null;
}

export function precheckDrawing(db: DwgDatabaseLite): DwgPrecheckIssue[] {
  // Text, numbers, dimensions, leaders/arrows, hatches, block inserts and
  // dashed/hidden/centerlines are silently filtered by `rasterizeDatabase`
  // — so we no longer reject a DWG/DXF for containing them. Returning an
  // empty list keeps the precheck API intact for callers.
  void db; void DASHED_LT_RE; void isNoiseType;
  return [];
}

export function describePrecheckIssues(issues: DwgPrecheckIssue[]): string {
  const label: Record<DwgPrecheckIssue["category"], string> = {
    text: "text / numbers",
    dimension: "dimensions",
    leader: "leaders / callouts",
    hatch: "hatches / fills",
    block_insert: "block inserts (furniture / symbols)",
    dashed_line: "dashed / hidden / centerlines",
  };
  return issues.map((i) => `${i.count} ${label[i.category]}`).join(", ");
}

/**
 * Render the parsed database to a black-on-white PNG so the existing
 * vision pipeline can run on it. The parser itself never rasterizes —
 * this helper is opt-in for callers that still need an image, e.g. the
 * room-segmentation step.
 */
export function rasterizeDatabase(
  db: DwgDatabaseLite,
  opts: { maxDimension?: number; padding?: number; entities?: DwgEntityLite[]; projectViewports?: boolean; permissive?: boolean } = {},
): { dataUrl: string; width: number; height: number; bounds: DwgDatabaseLite["extents"]; drawableCount: number } {
  const maxDim = opts.maxDimension ?? 2400;
  const padding = opts.padding ?? 24;
  const sourceEntities = expandRenderableEntities(db, opts.entities ?? db.entities, { projectViewports: opts.projectViewports });

  // SIMPLIFICATION RULES (must match what the room-detector expects):
  //  - Skip text / dimensions / leaders / hatches / blocks entirely.
  //  - Skip entities on layers whose linetype is dashed / hidden / center /
  //    phantom / dotted — those are construction or reference lines, not
  //    enclosing walls, and they break flood-fill region detection by
  //    creating tiny gap-noise.
  //  - Skip entities on layers whose name screams annotation / dim / text /
  //    grid / hatch / north / title / notes.
  // The result is a clean solid-line wireframe of just the architecture.
  const DASHED_LT = /(dash|hidden|center|phantom|dot|break|gap|divide)/i;
  // Match only whole segments of the layer name (segments are split by
  // `-`, `_`, space, `.` or start/end of string). This keeps real
  // architectural layers like A-WALL or STRUCTURE from being filtered.
  const NOISE_TOKENS = [
    "text","txt","dim","dims","annot","annotation","note","notes","tag","tags",
    "label","labels","title","titles","grid","grids","hatch","hatches","north",
    "symbol","symbols","legend","legends","scale","arrow","arrows","leader",
    "leaders","callout","callouts","number","numbers","stamp","stamps",
  ];
  const NOISE_LAYER = new RegExp(
    `(^|[\\s\\-_.])(${NOISE_TOKENS.join("|")})($|[\\s\\-_.])`,
    "i",
  );
  const layerByName = new Map(db.layers.map((l) => [l.name, l] as const));
  function isNoiseLayer(e: DwgEntityLite): boolean {
    return NOISE_LAYER.test(e.layer);
  }
  function isDashed(e: DwgEntityLite): boolean {
    const layer = layerByName.get(e.layer);
    if (layer?.frozen || layer?.on === false) return false;
    if (layer?.lineType && DASHED_LT.test(layer.lineType)) return false;
    if (e.lineType && DASHED_LT.test(e.lineType)) return false;
    return true;
  }
  function isDrawableType(e: DwgEntityLite): boolean {
    const t = e.type.toUpperCase();
    return !(t === "TEXT" || t === "MTEXT" || t === "ATTDEF" || t === "ATTRIB"
      || t === "DIMENSION" || t.startsWith("DIM")
      || t === "LEADER" || t === "MLEADER" || t === "MULTILEADER"
      || t === "HATCH" || t === "SOLID" || t === "INSERT" || t === "VIEWPORT");
  }
  // Permissive mode: grab EVERY vector line regardless of layer naming or
  // linetype (annotation entity types still stay out) — used when strict
  // filtering leaves too little linework to enclose areas.
  const visibleSolidEntities = opts.permissive
    ? sourceEntities.filter((e) => isDrawableType(e))
    : sourceEntities.filter((e) => isDrawableType(e) && isDashed(e));
  const strictEntities = opts.permissive
    ? visibleSolidEntities
    : visibleSolidEntities.filter((e) => !isNoiseLayer(e));
  // If a CAD author put real plan linework on a badly named layer, keep the
  // preview from going blank. Entity types still remove text/dimensions/arrows,
  // and dashed/hidden/center linetypes still stay out.
  const drawableEntities = strictEntities.length > 0 ? strictEntities : visibleSolidEntities;

  // Fall back to entity-bounding-box if extents are empty.
  let { min, max } = db.extents;
  // If a specific entity set was supplied (per-layout), recompute bounds
  // from those entities so the layout fills the page.
  if (opts.entities || max.x - min.x <= 0 || max.y - min.y <= 0) {
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (const e of drawableEntities) {
      for (const p of pointsOf(e)) {
        if (p.x < mnX) mnX = p.x; if (p.y < mnY) mnY = p.y;
        if (p.x > mxX) mxX = p.x; if (p.y > mxY) mxY = p.y;
      }
    }
    if (!isFinite(mnX) || !isFinite(mxX)) {
      mnX = 0; mnY = 0; mxX = 1000; mxY = 1000;
    }
    min = { x: mnX, y: mnY };
    max = { x: mxX, y: mxY };
  }

  const w = Math.max(1, max.x - min.x);
  const h = Math.max(1, max.y - min.y);
  const scale = Math.min((maxDim - 2 * padding) / w, (maxDim - 2 * padding) / h);
  const W = Math.round(w * scale + 2 * padding);
  const H = Math.round(h * scale + 2 * padding);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(2, Math.round(Math.min(W, H) / 900));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const tx = (x: number) => padding + (x - min.x) * scale;
  // Flip Y so drawings render right-side-up.
  const ty = (y: number) => H - (padding + (y - min.y) * scale);

  for (const e of drawableEntities) {
    const t = e.type.toUpperCase();
    if (t === "LINE" && e.start && e.end) {
      ctx.beginPath();
      ctx.moveTo(tx(e.start.x), ty(e.start.y));
      ctx.lineTo(tx(e.end.x), ty(e.end.y));
      ctx.stroke();
    } else if ((t === "LWPOLYLINE" || t === "POLYLINE" || t === "POLYLINE2D" || t === "POLYLINE3D" || t === "SPLINE" || t === "MLINE") && e.vertices && e.vertices.length > 1) {
      ctx.beginPath();
      e.vertices.forEach((v, i) => {
        const X = tx(v.x), Y = ty(v.y);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      if (e.closed) ctx.closePath();
      ctx.stroke();
    } else if (t === "CIRCLE" && e.center && typeof e.radius === "number") {
      ctx.beginPath();
      ctx.arc(tx(e.center.x), ty(e.center.y), e.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    } else if (t === "ARC" && e.center && typeof e.radius === "number"
        && typeof e.startAngle === "number" && typeof e.endAngle === "number") {
      ctx.beginPath();
      // Canvas Y is flipped, so swap angles + direction.
      ctx.arc(
        tx(e.center.x), ty(e.center.y),
        e.radius * scale,
        -e.endAngle, -e.startAngle,
        false,
      );
      ctx.stroke();
    } else if (t === "ELLIPSE" && e.center && e.majorAxisEndPoint) {
      const major = Math.hypot(e.majorAxisEndPoint.x, e.majorAxisEndPoint.y) * scale;
      const minor = major * (e.axisRatio ?? 1);
      const rotation = -Math.atan2(e.majorAxisEndPoint.y, e.majorAxisEndPoint.x);
      ctx.beginPath();
      ctx.ellipse(
        tx(e.center.x), ty(e.center.y),
        major, minor,
        rotation,
        -(e.endAngle ?? Math.PI * 2), -(e.startAngle ?? 0),
        false,
      );
      ctx.stroke();
    }
  }

  return { dataUrl: canvas.toDataURL("image/png"), width: W, height: H, bounds: { min, max }, drawableCount: drawableEntities.length };
}

export function expandRenderableEntities(
  db: DwgDatabaseLite,
  entities: DwgEntityLite[],
  opts: { projectViewports?: boolean } = {},
): DwgEntityLite[] {
  const blocks = new Map(db.blocks.map((b) => [b.name, b] as const));
  const out: DwgEntityLite[] = [];
  const model = db.entities;
  const projectViewports = opts.projectViewports ?? true;

  const expandInsert = (insert: DwgEntityLite, depth: number): DwgEntityLite[] => {
    if (!insert.blockName || depth > 6) return [];
    if (isNoiseName(insert.blockName) || isNoiseName(insert.layer)) return [];
    const block = blocks.get(insert.blockName);
    if (!block?.entities?.length || !insert.insertionPoint) return [];
    const sx = insert.scale?.x ?? 1;
    const sy = insert.scale?.y ?? sx;
    const rot = insert.rotation ?? 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const mapPoint = (p: { x: number; y: number; z?: number }) => {
      const x = (p.x - block.base.x) * sx;
      const y = (p.y - block.base.y) * sy;
      return {
        x: insert.insertionPoint!.x + x * cos - y * sin,
        y: insert.insertionPoint!.y + x * sin + y * cos,
        z: p.z,
      };
    };
    return block.entities.flatMap((child) => {
      const entity = transformEntity(child, mapPoint, Math.max(Math.abs(sx), Math.abs(sy)) || 1);
      if (child.layer === "0") entity.layer = insert.layer;
      if (entity.type.toUpperCase() === "INSERT") return expandInsert(entity, depth + 1);
      return [entity];
    });
  };

  const renderableModel = model.flatMap((entity) => entity.type.toUpperCase() === "INSERT" ? expandInsert(entity, 0) : [entity]);

  for (const entity of entities) {
    const t = entity.type.toUpperCase();
    if (t === "VIEWPORT" && projectViewports) {
      out.push(...projectModelThroughViewport(renderableModel, entity));
    } else if (t === "INSERT") {
      out.push(...expandInsert(entity, 0));
    } else if (t !== "VIEWPORT") {
      out.push(entity);
    }
  }
  return out;
}

function projectModelThroughViewport(model: DwgEntityLite[], viewport: DwgEntityLite): DwgEntityLite[] {
  if (viewport.status === 0 || ((viewport.statusBitFlags ?? 0) & 131072) !== 0) return [];
  const center = viewport.viewportCenter;
  const display = viewport.displayCenter ?? viewport.targetPoint;
  const width = viewport.width ?? 0;
  const height = viewport.height ?? 0;
  const viewHeight = viewport.viewHeight ?? 0;
  if (!center || !display || width <= 0 || height <= 0 || viewHeight <= 0) return [];

  const viewWidth = viewHeight * (width / height);
  const halfW = viewWidth / 2;
  const halfH = viewHeight / 2;
  const paperScale = height / viewHeight;
  const twist = -(viewport.viewTwistAngle ?? 0);
  const cos = Math.cos(twist);
  const sin = Math.sin(twist);
  const inView = (p: { x: number; y: number }) => p.x >= display.x - halfW && p.x <= display.x + halfW && p.y >= display.y - halfH && p.y <= display.y + halfH;
  const mapPoint = (p: { x: number; y: number; z?: number }) => {
    const dx = p.x - display.x;
    const dy = p.y - display.y;
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return { x: center.x + rx * paperScale, y: center.y + ry * paperScale, z: p.z };
  };

  return model
    .filter((entity) => pointsOf(entity).some(inView))
    .map((entity) => transformEntity(entity, mapPoint, paperScale));
}

function transformEntity(
  entity: DwgEntityLite,
  mapPoint: (p: { x: number; y: number; z?: number }) => { x: number; y: number; z?: number },
  radiusScale: number,
): DwgEntityLite {
  return {
    ...entity,
    start: entity.start ? mapPoint(entity.start) : undefined,
    end: entity.end ? mapPoint(entity.end) : undefined,
    center: entity.center ? mapPoint(entity.center) : undefined,
    majorAxisEndPoint: entity.majorAxisEndPoint,
    insertionPoint: entity.insertionPoint ? mapPoint(entity.insertionPoint) : undefined,
    vertices: entity.vertices?.map((v) => ({ ...mapPoint(v), bulge: v.bulge })),
    radius: entity.radius != null ? entity.radius * radiusScale : undefined,
  };
}

function isNoiseName(name: string): boolean {
  return /(^|[\s\-_.])(text|txt|dim|dims|annot|annotation|note|notes|tag|tags|label|labels|title|titles|grid|grids|hatch|hatches|north|symbol|symbols|legend|legends|scale|arrow|arrows|leader|leaders|callout|callouts|number|numbers|stamp|stamps|furn|furniture|fixture|fixtures|equip|equipment|appliance|appliances)($|[\s\-_.])/i.test(name);
}

function pointsOf(e: DwgEntityLite): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  if (e.start) out.push(e.start);
  if (e.end) out.push(e.end);
  if (e.center) {
    const r = e.radius ?? 0;
    out.push({ x: e.center.x - r, y: e.center.y - r });
    out.push({ x: e.center.x + r, y: e.center.y + r });
  }
  if (e.vertices) for (const v of e.vertices) out.push({ x: v.x, y: v.y });
  if (e.insertionPoint) out.push(e.insertionPoint);
  return out;
}