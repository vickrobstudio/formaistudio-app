/**
 * Deterministic plan-shape extraction from a raster floor-plan image.
 *
 * Applies the same enclosed-region pipeline the DXF path uses (binary line
 * mask → morphological door-closing → region polygonization) directly to an
 * uploaded image: black linework becomes wall bands that hug the drawing and
 * floor polygons for every enclosed room — geometry traced from the plan
 * itself instead of an AI's approximation. AI detection still supplies the
 * semantic extras (doors, windows, stairs, fixtures); this supplies shape
 * truth for walls and floors.
 */
import { closeOpenings, extractRoomRegions, type RoomRegion } from "./floor-pipeline";

export type PlanShapePolygon = {
  id: string;
  type: "wall" | "floor";
  points: Array<[number, number]>;
};

function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonArea(poly: Array<[number, number]>): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(area / 2);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the plan image."));
    img.src = dataUrl;
  });
}

function traceAtScale(
  img: HTMLImageElement,
  srcW: number,
  srcH: number,
  longSide: number,
): { rooms: RoomRegion[]; w: number; h: number } | null {
  const scale = Math.min(1, longSide / Math.max(srcW, srcH));
  const w = Math.max(64, Math.round(srcW * scale));
  const h = Math.max(64, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < mask.length; p++) {
    const o = p * 4;
    // Dark linework on light paper; generous threshold tolerates grey scans.
    if (rgba[o] + rgba[o + 1] + rgba[o + 2] < 420) mask[p] = 1;
  }
  // Dilate+erode seals gaps up to 2×radius: at the coarser scales this
  // covers a full door width even on generously scaled drawings.
  const closeRadius = Math.max(4, Math.min(20, Math.round(Math.max(w, h) / 32)));
  const closed = closeOpenings(mask, w, h, closeRadius);
  const regions = extractRoomRegions(closed, w, h);
  // Rooms only: drop text-cell noise (<0.4% of sheet) and page-frame /
  // title-block scale regions (>55%).
  const rooms = regions.filter((region: RoomRegion) => {
    const area = polygonArea(region.polygon);
    return area >= 0.004 && area <= 0.55;
  });
  return { rooms, w, h };
}

export async function extractPlanShapes(imageDataUrl: string): Promise<PlanShapePolygon[] | null> {
  const img = await loadImage(imageDataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return null;

  // Door widths in pixels depend on the unknown drawing scale, so try a few
  // analysis resolutions (finer = more precise walls, coarser = seals wider
  // door gaps) and keep the attempt that separates the most rooms; ties go
  // to the finer scale for geometry quality.
  let best: { rooms: RoomRegion[]; w: number; h: number } | null = null;
  for (const longSide of [1100, 640, 380]) {
    const attempt = traceAtScale(img, srcW, srcH, longSide);
    if (attempt && attempt.rooms.length > (best?.rooms.length ?? 0)) best = attempt;
  }
  if (!best || !best.rooms.length) return null;
  const { rooms, w, h } = best;

  const wallThicknessPx = Math.max(2, Math.round(Math.max(w, h) * 0.008));
  const polygons: PlanShapePolygon[] = [];

  rooms.forEach((region, ri) => {
    polygons.push({ id: `shape_floor_${ri}`, type: "floor", points: region.polygon });
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
      // Wall band points OUTWARD from the room interior.
      const probe: [number, number] = [(x0 + x1) / 2 + nx * 3, (y0 + y1) / 2 + ny * 3];
      if (pointInPolygon(probe[0], probe[1], pts)) {
        nx = -nx;
        ny = -ny;
      }
      const t = wallThicknessPx;
      polygons.push({
        id: `shape_wall_${ri}_${i}`,
        type: "wall",
        points: [
          [x0 / w, y0 / h],
          [x1 / w, y1 / h],
          [(x1 + nx * t) / w, (y1 + ny * t) / h],
          [(x0 + nx * t) / w, (y0 + ny * t) / h],
        ],
      });
    }
  });

  // The lift endpoint caps polygons — keep all floors, trim excess walls.
  if (polygons.length > 700) {
    const floors = polygons.filter((p) => p.type === "floor");
    const walls = polygons.filter((p) => p.type === "wall").slice(0, 700 - floors.length);
    return [...floors, ...walls];
  }
  return polygons;
}
