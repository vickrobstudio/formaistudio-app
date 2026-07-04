/**
 * Deterministic DWG/DXF → 3D-ready recognition. No AI calls.
 *
 * Pipeline: walls-only raster (annotation already stripped by
 * `rasterizeDatabase`) → binary line mask → morphological door closing →
 * enclosed-region polygonization (`floor-pipeline.ts`) → wall band quads +
 * room floor polygons in the exact `Recognition` shape the AI path emits,
 * plus room names read from the drawing's TEXT/MTEXT entities.
 *
 * True scale comes from the CAD file itself: model-space extents ×
 * `unitToMeters` (INSUNITS). No calibration needed when units are sane.
 */
import {
  expandRenderableEntities,
  rasterizeDatabase,
  type DwgDatabaseLite,
  type DwgEntityLite,
} from "./dwg-database";
import { closeOpenings, extractRoomRegions, type RoomRegion } from "./floor-pipeline";

export type VectorRecognition = {
  recognition: {
    imageWidth: number;
    imageHeight: number;
    planWidthMeters: number;
    polygons: Array<{ id: string; type: "wall" | "floor"; points: Array<[number, number]> }>;
  };
  /** Room boundaries (normalized 0..1) with names read from TEXT entities. */
  rooms: Array<{ name?: string; points: Array<[number, number]> }>;
  planWidthMeters: number;
  /** True when INSUNITS produced an implausible size and the default 12 m was used. */
  needsCalibration: boolean;
  /** Clean walls-only raster (white bg, black linework). */
  dataUrl: string;
};

const RASTER_MAX = 2400;
const RASTER_PAD = 24;

function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the rasterized drawing."));
    img.src = dataUrl;
  });
}

/** Strip MTEXT inline formatting codes ({\fArial...;}, \P line breaks, …). */
function cleanCadText(text: string): string {
  return text
    .replace(/\\[Pp]/g, " ")
    .replace(/\{\\[^;{}]*;/g, "")
    .replace(/\\[A-Za-z][^;\\{}]*;/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Dimension-ish or empty strings are not room names. */
function isRoomLabel(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (/^[\d\s.,'"×xX*/\-+=%#()]+$/.test(t)) return false; // pure numbers / dimension strings
  if (/^(scale|sheet|dwg|drawn|checked|date|rev|no\.?)\b/i.test(t)) return false;
  return true;
}

export async function buildVectorRecognition(
  db: DwgDatabaseLite,
  entities?: DwgEntityLite[],
): Promise<VectorRecognition | null> {
  const source = entities ?? db.entities;
  if (!source.length) return null;

  const raster = rasterizeDatabase(db, {
    maxDimension: RASTER_MAX,
    entities: source,
    projectViewports: false,
  });
  if (raster.drawableCount === 0) return null;
  const { dataUrl, width: W, height: H, bounds } = raster;

  // ── True scale from CAD units.
  const bw = Math.max(1e-9, bounds.max.x - bounds.min.x);
  const bh = Math.max(1e-9, bounds.max.y - bounds.min.y);
  const rawWidthMeters = Math.max(bw, bh) * db.unitToMeters;
  const needsCalibration = !(rawWidthMeters >= 3 && rawWidthMeters <= 500);
  const planWidthMeters = needsCalibration ? 12 : rawWidthMeters;
  const mPerPx = planWidthMeters / Math.max(W, H);

  // Replicate the raster's drawing-units → pixel transform for TEXT placement.
  const scalePx = Math.min((RASTER_MAX - 2 * RASTER_PAD) / bw, (RASTER_MAX - 2 * RASTER_PAD) / bh);
  const toPx = (p: { x: number; y: number }): [number, number] => [
    RASTER_PAD + (p.x - bounds.min.x) * scalePx,
    H - (RASTER_PAD + (p.y - bounds.min.y) * scalePx),
  ];

  // ── Binary line mask at ANALYSIS resolution. Region detection runs on a
  // low-resolution raster sized so a door opening (~1 m) is ≈ 20 px — small
  // enough for the morphological closing to seal it, big enough to keep room
  // outlines accurate (≈ 5 cm/px on a typical plan). Rendered as a SECOND
  // vector rasterization (not a downscale of the display image) so lines
  // stay solid black instead of fading to grey antialiasing.
  const targetMPerPx = 1.0 / 20;
  const analysisLongSide = Math.max(256, Math.min(1024, Math.round(planWidthMeters / targetMPerPx)));
  const analysis = rasterizeDatabase(db, {
    maxDimension: analysisLongSide,
    padding: 8,
    entities: source,
    projectViewports: false,
  });
  const wA = analysis.width;
  const hA = analysis.height;
  const mPerPxA = planWidthMeters / Math.max(wA, hA);

  const img = await loadImage(analysis.dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = wA;
  canvas.height = hA;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, wA, hA);
  ctx.drawImage(img, 0, 0, wA, hA);
  const rgba = ctx.getImageData(0, 0, wA, hA).data;
  const mask = new Uint8Array(wA * hA);
  for (let p = 0; p < mask.length; p++) {
    // Luminance threshold — vector-rendered black strokes on white.
    const o = p * 4;
    if (rgba[o] + rgba[o + 1] + rgba[o + 2] < 384) mask[p] = 1;
  }

  // Seal door openings before region detection: a door is ~0.9–1.0 m.
  const doorPxA = 1.0 / mPerPxA;
  const closeRadius = Math.max(3, Math.min(20, Math.ceil(doorPxA * 0.6)));
  const closed = closeOpenings(mask, wA, hA, closeRadius);
  const regions = extractRoomRegions(closed, wA, hA);
  if (regions.length === 0) return null;

  // ── Wall bands + floors from every room boundary (analysis px space).
  const wallThicknessPx = Math.max(2, Math.min(30, 0.18 / mPerPxA));
  const polygons: VectorRecognition["recognition"]["polygons"] = [];

  regions.forEach((region: RoomRegion, ri: number) => {
    polygons.push({ id: `floor_r${ri}`, type: "floor", points: region.polygon });

    const pts = region.contourPx;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 3) continue;
      let nx = -dy / len;
      let ny = dx / len;
      // Point the band OUTWARD (away from the room interior).
      const probe: [number, number] = [(x0 + x1) / 2 + nx * 3, (y0 + y1) / 2 + ny * 3];
      if (pointInPolygon(probe[0], probe[1], pts)) {
        nx = -nx;
        ny = -ny;
      }
      const t = wallThicknessPx;
      const quad: Array<[number, number]> = [
        [x0 / wA, y0 / hA],
        [x1 / wA, y1 / hA],
        [(x1 + nx * t) / wA, (y1 + ny * t) / hA],
        [(x0 + nx * t) / wA, (y0 + ny * t) / hA],
      ];
      polygons.push({ id: `wall_r${ri}_e${i}`, type: "wall", points: quad });
    }
  });

  // ── Room names from TEXT/MTEXT ("read wording"), blocks expanded.
  const expanded = expandRenderableEntities(db, source, { projectViewports: false });
  const labels = expanded
    .filter((e) => {
      const t = e.type.toUpperCase();
      return (t === "TEXT" || t === "MTEXT") && e.text && e.insertionPoint;
    })
    .map((e) => {
      const [px, py] = toPx(e.insertionPoint!);
      return { text: cleanCadText(e.text!), norm: [px / W, py / H] as [number, number], size: e.height ?? 0 };
    })
    .filter((l) => isRoomLabel(l.text))
    .sort((a, b) => b.size - a.size);

  const rooms: VectorRecognition["rooms"] = regions.map((region) => {
    const hit = labels.find((l) => pointInPolygon(l.norm[0], l.norm[1], region.polygon));
    return { name: hit?.text, points: region.polygon };
  });

  // The lift endpoint caps at 800 polygons — drop excess wall bands, never floors.
  if (polygons.length > 780) {
    const floors = polygons.filter((p) => p.type === "floor");
    const walls = polygons.filter((p) => p.type === "wall").slice(0, 780 - floors.length);
    polygons.length = 0;
    polygons.push(...floors, ...walls);
  }

  return {
    recognition: { imageWidth: W, imageHeight: H, planWidthMeters, polygons },
    rooms,
    planWidthMeters,
    needsCalibration,
    dataUrl,
  };
}
