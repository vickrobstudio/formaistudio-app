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
  /** Original DwgDatabase for advanced consumers. */
  raw: DwgDatabase;
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
    if (!dwgHandle) throw new Error("Could not parse DXF file.");
    db = libredwg.convert(dwgHandle);
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

function pt(p: unknown): { x: number; y: number; z?: number } | undefined {
  if (!p || typeof p !== "object") return undefined;
  const o = p as Record<string, unknown>;
  const x = typeof o.x === "number" ? o.x : undefined;
  const y = typeof o.y === "number" ? o.y : undefined;
  const z = typeof o.z === "number" ? o.z : undefined;
  if (x == null || y == null) return undefined;
  return z != null ? { x, y, z } : { x, y };
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
      frozen: Boolean(r.isFrozen),
      locked: Boolean(r.isLocked),
      on: r.isOff != null ? !r.isOff : true,
      lineType: typeof r.lineType === "string" ? (r.lineType as string) : undefined,
    };
  });

  const blockEntries = db.tables?.BLOCK_RECORD?.entries ?? [];
  const blocks: DwgBlockLite[] = blockEntries.map((b) => {
    const r = b as unknown as Record<string, unknown>;
    return {
      name: String(r.name ?? ""),
      base: pt(r.basePoint) ?? { x: 0, y: 0 },
      entityCount: Array.isArray(r.entities) ? (r.entities as unknown[]).length : 0,
    };
  });

  const entities: DwgEntityLite[] = (db.entities ?? []).map((e, i) =>
    normalizeEntity(e as unknown as Record<string, unknown>, i),
  );

  return {
    source,
    units,
    unitToMeters: UNIT_TO_METERS[units] ?? 1,
    extents: { min: { x: extmin.x, y: extmin.y }, max: { x: extmax.x, y: extmax.y } },
    layers,
    blocks,
    entities,
    raw: db,
  };
}

function normalizeEntity(e: Record<string, unknown>, i: number): DwgEntityLite {
  const type = String(e.type ?? e.entityType ?? "UNKNOWN");
  const layer = String(e.layer ?? "0");
  const colorIndex = typeof e.colorIndex === "number" ? (e.colorIndex as number) : undefined;

  const base: DwgEntityLite = { id: i, type, layer, colorIndex };

  switch (type.toUpperCase()) {
    case "LINE":
      base.start = pt(e.startPoint) ?? pt(e.start);
      base.end = pt(e.endPoint) ?? pt(e.end);
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
    case "POLYLINE": {
      const verts = Array.isArray(e.vertices) ? (e.vertices as unknown[]) : [];
      base.vertices = verts.map((v) => {
        const r = (v ?? {}) as Record<string, unknown>;
        return {
          x: typeof r.x === "number" ? (r.x as number) : 0,
          y: typeof r.y === "number" ? (r.y as number) : 0,
          bulge: typeof r.bulge === "number" ? (r.bulge as number) : undefined,
        };
      });
      base.closed = Boolean(e.isClosed ?? e.closed);
      break;
    }
    case "TEXT":
    case "MTEXT":
      base.text = typeof e.text === "string" ? (e.text as string) : "";
      base.insertionPoint = pt(e.insertionPoint) ?? pt(e.startPoint);
      base.rotation = typeof e.rotation === "number" ? (e.rotation as number) : undefined;
      break;
    case "INSERT":
      base.blockName = typeof e.name === "string" ? (e.name as string) : "";
      base.insertionPoint = pt(e.insertionPoint);
      base.rotation = typeof e.rotation === "number" ? (e.rotation as number) : undefined;
      base.scale = pt(e.scale);
      break;
    default:
      // Keep unknown entities in the list so consumers can decide what to do.
      break;
  }

  return base;
}

/** Quick summary used in toasts / debug panes. */
export function summarize(db: DwgDatabaseLite): string {
  const w = Math.max(0, db.extents.max.x - db.extents.min.x);
  const h = Math.max(0, db.extents.max.y - db.extents.min.y);
  return `${db.source.toUpperCase()} · ${db.entities.length} entities · ${db.layers.length} layers · ${db.blocks.length} blocks · ${w.toFixed(1)}×${h.toFixed(1)} ${db.units}`;
}

/**
 * Render the parsed database to a black-on-white PNG so the existing
 * vision pipeline can run on it. The parser itself never rasterizes —
 * this helper is opt-in for callers that still need an image, e.g. the
 * room-segmentation step.
 */
export function rasterizeDatabase(
  db: DwgDatabaseLite,
  opts: { maxDimension?: number; padding?: number } = {},
): { dataUrl: string; width: number; height: number; bounds: DwgDatabaseLite["extents"] } {
  const maxDim = opts.maxDimension ?? 2400;
  const padding = opts.padding ?? 24;

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
  const NOISE_LAYER = /(text|dim|annot|note|tag|label|title|grid|hatch|north|symbol|legend|scale|reference|axis|center)/i;
  const layerByName = new Map(db.layers.map((l) => [l.name, l] as const));
  function shouldDraw(e: DwgEntityLite): boolean {
    const layer = layerByName.get(e.layer);
    if (layer?.frozen || layer?.on === false) return false;
    if (layer?.lineType && DASHED_LT.test(layer.lineType)) return false;
    if (NOISE_LAYER.test(e.layer)) return false;
    return true;
  }

  // Fall back to entity-bounding-box if extents are empty.
  let { min, max } = db.extents;
  if (max.x - min.x <= 0 || max.y - min.y <= 0) {
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (const e of db.entities) {
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

  const w = max.x - min.x;
  const h = max.y - min.y;
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
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const tx = (x: number) => padding + (x - min.x) * scale;
  // Flip Y so drawings render right-side-up.
  const ty = (y: number) => H - (padding + (y - min.y) * scale);

  for (const e of db.entities) {
    const t = e.type.toUpperCase();
    // Drop annotation/dimension/text/hatch/block-insert entirely.
    if (t === "TEXT" || t === "MTEXT" || t === "ATTDEF" || t === "ATTRIB"
        || t === "DIMENSION" || t.startsWith("DIM")
        || t === "LEADER" || t === "MLEADER" || t === "MULTILEADER"
        || t === "HATCH" || t === "SOLID" || t === "INSERT") continue;
    if (!shouldDraw(e)) continue;
    if (t === "LINE" && e.start && e.end) {
      ctx.beginPath();
      ctx.moveTo(tx(e.start.x), ty(e.start.y));
      ctx.lineTo(tx(e.end.x), ty(e.end.y));
      ctx.stroke();
    } else if ((t === "LWPOLYLINE" || t === "POLYLINE") && e.vertices && e.vertices.length > 1) {
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
    }
  }

  return { dataUrl: canvas.toDataURL("image/png"), width: W, height: H, bounds: { min, max } };
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