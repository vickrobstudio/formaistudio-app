/**
 * Deterministic plan-shape extraction from a raster floor-plan image.
 *
 * v2 — walls come from the drawing itself:
 *  1. Text, symbols and small marks are removed (connected-component filter).
 *  2. Hairlines (dimensions, site lines) are erased by a morphological
 *     opening sized to the thin-stroke width; the surviving thick strokes
 *     are fused (double-line walls become solid bodies) into a WALL MASK.
 *  3. Rooms are enclosed regions whose boundary actually touches the wall
 *     mask — pool decks, planters and site areas bounded only by hairlines
 *     are rejected.
 *  4. Each wall band's thickness is probed from the wall mask, so drawn
 *     double-line walls come through at their real drawn thickness.
 *
 * The AI supplies semantics only: doors, windows, stairs, fixtures, and the
 * printed room names (matched to traced rooms by their label position).
 */
import { closeOpenings, extractRoomRegions, type RoomRegion } from "./floor-pipeline";

export type PlanShapePolygon = {
  id: string;
  type: "wall" | "floor" | "door" | "window";
  points: Array<[number, number]>;
};

export type PlanShapes = {
  polygons: PlanShapePolygon[];
  /**
   * Traced regions with their wall-boundedness score (0..1) and text
   * density (how much of the interior was removed as text — title blocks
   * and note boxes are text-stuffed). The caller arbitrates: a region is
   * a real room if a printed ROOM label sits inside it, or its wallScore
   * is high and it isn't full of text.
   */
  rooms: Array<{ index: number; points: Array<[number, number]>; wallScore: number; textScore: number }>;
};

export function pointInPolygon(x: number, y: number, poly: Array<[number, number]>): boolean {
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

/** One 8-neighbour dilate pass, repeated r times. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let src = mask;
  for (let pass = 0; pass < r; pass++) {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i]) { out[i] = 1; continue; }
        if (
          (x > 0 && src[i - 1]) || (x < w - 1 && src[i + 1]) ||
          (y > 0 && src[i - w]) || (y < h - 1 && src[i + w]) ||
          (x > 0 && y > 0 && src[i - w - 1]) || (x < w - 1 && y > 0 && src[i - w + 1]) ||
          (x > 0 && y < h - 1 && src[i + w - 1]) || (x < w - 1 && y < h - 1 && src[i + w + 1])
        ) out[i] = 1;
      }
    }
    src = out;
  }
  return src;
}

/** One 8-neighbour erode pass, repeated r times. */
function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let src = mask;
  for (let pass = 0; pass < r; pass++) {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!src[i]) continue;
        if (
          x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
          !src[i - 1] || !src[i + 1] || !src[i - w] || !src[i + w] ||
          !src[i - w - 1] || !src[i - w + 1] || !src[i + w - 1] || !src[i + w + 1]
        ) continue;
        out[i] = 1;
      }
    }
    src = out;
  }
  return src;
}

/** Remove small isolated components: text, arrows, symbols, specks. */
function removeSmallComponents(mask: Uint8Array, w: number, h: number, maxDim: number, maxPixels: number): Uint8Array {
  const out = mask.slice();
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!out[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const pixels: number[] = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (top > 0) {
      const i = stack[--top];
      pixels.push(i);
      const x = i % w, y = (i / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (out[ni] && !seen[ni]) { seen[ni] = 1; stack[top++] = ni; }
        }
      }
    }
    const dim = Math.max(maxX - minX, maxY - minY);
    if (dim < maxDim && pixels.length < maxPixels) {
      for (const i of pixels) out[i] = 0;
    }
  }
  return out;
}

/** Dark-run width stats along both axes: p25 ≈ hairlines, p75 ≈ wall strokes. */
function strokeStats(mask: Uint8Array, w: number, h: number): { p25: number; p75: number } {
  const runs: number[] = [];
  const cap = Math.max(w, h) * 0.05;
  for (let y = 0; y < h; y += 5) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      const on = x < w && mask[y * w + x] === 1;
      if (on) run++;
      else if (run > 0) { if (run <= cap) runs.push(run); run = 0; }
    }
  }
  for (let x = 0; x < w; x += 5) {
    let run = 0;
    for (let y = 0; y <= h; y++) {
      const on = y < h && mask[y * w + x] === 1;
      if (on) run++;
      else if (run > 0) { if (run <= cap) runs.push(run); run = 0; }
    }
  }
  if (!runs.length) return { p25: 1, p75: 2 };
  runs.sort((a, b) => a - b);
  return { p25: runs[Math.floor(runs.length * 0.25)], p75: runs[Math.floor(runs.length * 0.75)] };
}

type TraceAttempt = {
  rooms: Array<{ region: RoomRegion; wallScore: number; textScore: number }>;
  /** Whether the wall mask was dense enough to score regions against. */
  usable: boolean;
  w: number;
  h: number;
  wallMask: Uint8Array;
  p75: number;
  closeRadius: number;
};

/**
 * The door-sealing closing rounds every room corner into a diagonal chamfer
 * (which then reads as a fake door). Square them back: a short edge flanked
 * by two long edges is replaced with the intersection of the flanking lines.
 */
function squareCorners(pts: Array<[number, number]>, closeRadius: number): Array<[number, number]> {
  const n = pts.length;
  if (n < 4) return pts;
  const longMin = closeRadius * 2.2;
  const maxDetour = closeRadius * 5;
  const edgeLen = (i: number) => {
    const a = pts[i], b = pts[(i + 1) % n];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  const longEdges: number[] = [];
  for (let i = 0; i < n; i++) if (edgeLen(i) >= longMin) longEdges.push(i);
  if (longEdges.length < 2) return pts;

  const out: Array<[number, number]> = [];
  for (let li = 0; li < longEdges.length; li++) {
    const e1 = longEdges[li];
    const e2 = longEdges[(li + 1) % longEdges.length];
    // The long edge itself starts where the previous corner ended.
    out.push(pts[e1], pts[(e1 + 1) % n]);
    // Chain between end of e1 and start of e2 (the rounded corner steps).
    const chain: Array<[number, number]> = [];
    for (let j = (e1 + 1) % n; j !== e2; j = (j + 1) % n) {
      if (j !== (e1 + 1) % n) chain.push(pts[j]);
    }
    const b1 = pts[(e1 + 1) % n];
    const a2 = pts[e2];
    const gap = Math.hypot(a2[0] - b1[0], a2[1] - b1[1]);
    const a1 = pts[e1];
    const b2 = pts[(e2 + 1) % n];
    const r = [b1[0] - a1[0], b1[1] - a1[1]];
    const s = [b2[0] - a2[0], b2[1] - a2[1]];
    const denom = r[0] * s[1] - r[1] * s[0];
    let squared = false;
    if (gap <= maxDetour && Math.abs(denom) > 1e-9) {
      const t = ((a2[0] - a1[0]) * s[1] - (a2[1] - a1[1]) * s[0]) / denom;
      const px = a1[0] + t * r[0];
      const py = a1[1] + t * r[1];
      if (Math.hypot(px - b1[0], py - b1[1]) <= closeRadius * 4.5) {
        // Replace the whole rounded chain with the true corner point.
        out[out.length - 1] = [px, py];
        squared = true;
      }
    }
    if (!squared) out.push(...chain);
  }
  // Remove immediate duplicates.
  return out.filter((p, i) => {
    const q = out[(i - 1 + out.length) % out.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5;
  });
}

function traceAtScale(img: HTMLImageElement, srcW: number, srcH: number, longSide: number): TraceAttempt | null {
  const scale = Math.min(1, longSide / Math.max(srcW, srcH));
  const w = Math.max(64, Math.round(srcW * scale));
  const h = Math.max(64, Math.round(srcH * scale));
  const L = Math.max(w, h);
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
    if (rgba[o] + rgba[o + 1] + rgba[o + 2] < 420) mask[p] = 1;
  }

  // 1. Drop text/symbols so labels can't seal fake rooms or become walls.
  const clean = removeSmallComponents(mask, w, h, L * 0.035, Math.round(L * 0.03) ** 2);
  const { p25, p75 } = strokeStats(clean, w, h);

  // 2. Wall mask: opening kills hairlines (dimensions, site lines), then a
  //    fuse-closing welds double-line walls into solid bodies. At coarse
  //    scales the wall strokes themselves are 1-2px — opening would erase
  //    them, so it only runs when strokes are thick enough to survive.
  const rOpen = p75 >= 4 ? Math.min(3, Math.max(1, Math.round(p25))) : 0;
  const opened = rOpen > 0 ? dilate(erode(clean, w, h, rOpen), w, h, rOpen) : clean;
  const rFuse = Math.max(3, Math.min(Math.round(L * 0.03), Math.round(p75 * 1.8)));
  const wallMask = closeOpenings(opened, w, h, rFuse);
  let wallPx = 0;
  for (let i = 0; i < wallMask.length; i++) wallPx += wallMask[i];
  const wallMaskUsable = wallPx > wallMask.length * 0.001;

  // 3. Rooms: enclosed regions on the cleaned drawing, door gaps sealed.
  // Seal door gaps: the larger of the sheet-relative radius and twice the
  // wall stroke (thick-stroke plans have wider doors), capped for speed.
  const closeRadius = Math.max(4, Math.min(20, Math.max(Math.round(L / 32), Math.round(p75 * 2))));
  const closed = closeOpenings(clean, w, h, closeRadius);
  const regions = extractRoomRegions(closed, w, h);

  // 4. Score each region by how much of its boundary runs along walls.
  //    Weak regions are kept here (score attached) — the caller drops them
  //    unless a printed room label lands inside.
  const probeR = Math.max(3, Math.min(12, Math.round(p75 * 1.5)));
  const scoreRegion = (region: RoomRegion): number => {
    if (!wallMaskUsable) return 0.5;
    const pts = region.contourPx;
    const step = Math.max(1, Math.floor(pts.length / 48));
    let touched = 0, sampled = 0;
    for (let i = 0; i < pts.length; i += step) {
      sampled++;
      const [cx, cy] = pts[i];
      let hit = false;
      for (let dy = -probeR; dy <= probeR && !hit; dy++) {
        for (let dx = -probeR; dx <= probeR && !hit; dx++) {
          const nx = Math.round(cx + dx), ny = Math.round(cy + dy);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (wallMask[ny * w + nx]) hit = true;
        }
      }
      if (hit) touched++;
    }
    return sampled > 0 ? touched / sampled : 0;
  };
  // Text density inside a region: title blocks and note boxes are stuffed
  // with removed-text pixels; rooms carry only a sparse label.
  const textScoreOf = (region: RoomRegion): number => {
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    for (const [px, py] of region.polygon) {
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    let inside = 0, text = 0;
    for (let gy = 0; gy < 16; gy++) {
      for (let gx = 0; gx < 16; gx++) {
        const nx = minX + ((gx + 0.5) / 16) * (maxX - minX);
        const ny = minY + ((gy + 0.5) / 16) * (maxY - minY);
        if (!pointInPolygon(nx, ny, region.polygon)) continue;
        inside++;
        const px = Math.min(w - 1, Math.round(nx * w));
        const py = Math.min(h - 1, Math.round(ny * h));
        const i = py * w + px;
        if (mask[i] && !clean[i]) text++;
      }
    }
    return inside > 0 ? text / inside : 0;
  };

  const rooms: Array<{ region: RoomRegion; wallScore: number; textScore: number }> = [];
  for (const region of regions) {
    const area = polygonArea(region.polygon);
    if (area < 0.003 || area > 0.55) continue;
    const wallScore = scoreRegion(region);
    if (wallScore < 0.2) continue; // pure hairline cells never qualify
    rooms.push({ region, wallScore, textScore: textScoreOf(region) });
  }

  return { rooms, usable: wallMaskUsable, w, h, wallMask, p75, closeRadius };
}

/** Measure the drawn wall depth outward from a room edge via the wall mask. */
function probeWallDepth(
  wallMask: Uint8Array, w: number, h: number,
  x: number, y: number, nx: number, ny: number,
  maxT: number,
  startGap: number,
): number {
  let started = -1;
  let depth = 0;
  for (let s = 1; s <= maxT + startGap; s++) {
    const px = Math.round(x + nx * s), py = Math.round(y + ny * s);
    if (px < 0 || py < 0 || px >= w || py >= h) break;
    const on = wallMask[py * w + px] === 1;
    if (on) { if (started < 0) started = s; depth = s - started + 1; }
    else if (started >= 0) break;
    else if (s > startGap) break; // no wall within reach
  }
  return started >= 0 ? depth : 0;
}

export async function extractPlanShapes(imageDataUrl: string): Promise<PlanShapes | null> {
  const img = await loadImage(imageDataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return null;

  let best: TraceAttempt | null = null;
  // A scale with a readable wall mask always beats one where every region
  // got the blind 0.5 fallback — junk cells must be judgeable.
  const quality = (a: TraceAttempt) =>
    a.rooms.filter((r) => r.wallScore >= 0.5).length * (a.usable ? 100 : 30) + a.rooms.length;
  for (const longSide of [1100, 640, 380]) {
    const attempt = traceAtScale(img, srcW, srcH, longSide);
    if (attempt && quality(attempt) > (best ? quality(best) : 0)) best = attempt;
  }
  if (!best || !best.rooms.length) return null;
  const { rooms, w, h, wallMask, p75, closeRadius } = best;

  const L = Math.max(w, h);
  const minT = Math.max(3, Math.round(L * 0.008));
  const maxT = Math.round(L * 0.045);
  // Contours can sit a few px off the wall face (door-seal bridges) and
  // window lines a wall-gap away — let the probe reach across both.
  const startGap = Math.max(8, Math.round(p75 * 3));
  const defaultT = Math.round(Math.min(maxT, Math.max(L * 0.012, p75 * 1.6)));
  const polygons: PlanShapePolygon[] = [];
  const roomsOut: PlanShapes["rooms"] = [];

  rooms.forEach(({ region, wallScore, textScore }, ri) => {
    // Merge near-collinear contour steps into long clean wall runs.
    const raw = region.contourPx;
    const merged: Array<[number, number]> = [];
    for (const p of raw) {
      if (merged.length >= 2) {
        const a = merged[merged.length - 2];
        const b = merged[merged.length - 1];
        const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const l2 = Math.hypot(p[0] - b[0], p[1] - b[1]);
        const dot = l1 && l2 ? ((b[0] - a[0]) * (p[0] - b[0]) + (b[1] - a[1]) * (p[1] - b[1])) / (l1 * l2) : 0;
        if (dot > 0.995) { merged[merged.length - 1] = p; continue; }
      }
      merged.push(p);
    }
    // Square the door-seal corner chamfers back to true corners so floors
    // are rectangular and no phantom door bands appear on the diagonals.
    const pts = squareCorners(merged, closeRadius);
    const floorPts = pts.map(([px, py]) => [px / w, py / h] as [number, number]);
    polygons.push({ id: `shape_floor_${ri}`, type: "floor", points: floorPts });
    roomsOut.push({ index: ri, points: floorPts, wallScore, textScore });

    // Pass 1: measure the drawn wall depth along every boundary segment.
    type Seg = { x0: number; y0: number; dx: number; dy: number; len: number; nx: number; ny: number; depth: number };
    const segs: Seg[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy);
      if (len < 3) continue;
      let nx = -dy / len;
      let ny = dx / len;
      const probe: [number, number] = [(x0 + x1) / 2 + nx * 3, (y0 + y1) / 2 + ny * 3];
      if (pointInPolygon(probe[0], probe[1], pts)) {
        nx = -nx;
        ny = -ny;
      }
      const depths = [0.25, 0.5, 0.75]
        .map((f) => probeWallDepth(wallMask, w, h, x0 + dx * f, y0 + dy * f, nx, ny, maxT, startGap))
        .filter((d) => d > 0)
        .sort((a, b) => a - b);
      const depth = depths.length ? depths[Math.floor(depths.length / 2)] : 0;
      segs.push({ x0, y0, dx, dy, len, nx, ny, depth });
    }
    const positives = segs.filter((s) => s.depth > 0).map((s) => s.depth).sort((a, b) => a - b);
    const medT = positives.length ? positives[Math.floor(positives.length / 2)] : defaultT;

    // Pass 2: walk each boundary run sampling the drawn wall depth, and
    // split it where the wall character changes: no wall → door (if door
    // sized) or open passage; much thinner than the room's median → window
    // symbol; otherwise wall at its drawn (tamed) thickness.
    const classOf = (d: number): 0 | 1 | 2 => (d === 0 ? 0 : medT >= 4 && d <= medT * 0.5 ? 1 : 2);
    segs.forEach((s, i) => {
      const steps = Math.max(3, Math.round(s.len / (L * 0.012)));
      const samples: number[] = [];
      for (let k = 0; k < steps; k++) {
        const f = (k + 0.5) / steps;
        samples.push(probeWallDepth(wallMask, w, h, s.x0 + s.dx * f, s.y0 + s.dy * f, s.nx, s.ny, maxT, startGap));
      }
      let runStart = 0;
      for (let k = 1; k <= steps; k++) {
        if (k !== steps && classOf(samples[k]) === classOf(samples[runStart])) continue;
        const f0 = runStart / steps;
        const f1 = k / steps;
        const cl = classOf(samples[runStart]);
        const frac = (s.len * (f1 - f0)) / L;
        const runDepths = samples.slice(runStart, k).filter((d) => d > 0).sort((a, b) => a - b);
        const depth = runDepths.length ? runDepths[Math.floor(runDepths.length / 2)] : 0;
        runStart = k;
        // Walls only: where the drawing has a wall, a band at its drawn
        // (tamed) thickness; where it has none, NOTHING — no fabricated
        // band over doorways and passages. Doors/windows come from the
        // tiled AI pass, which sees the actual symbols.
        let type: "wall" | null = null;
        let t = 0;
        if (cl !== 0 && frac >= 0.004) {
          type = "wall";
          t = Math.max(minT, Math.min(maxT, Math.min(depth || medT, Math.round(medT * 1.8))));
        }
        if (!type) continue;
        const ax = s.x0 + s.dx * f0, ay = s.y0 + s.dy * f0;
        const bx = s.x0 + s.dx * f1, by = s.y0 + s.dy * f1;
        polygons.push({
          id: `shape_${type}_${ri}_${i}_${k}`,
          type,
          points: [
            [ax / w, ay / h],
            [bx / w, by / h],
            [(bx + s.nx * t) / w, (by + s.ny * t) / h],
            [(ax + s.nx * t) / w, (ay + s.ny * t) / h],
          ],
        });
      }
    });
  });

  // The lift endpoint caps polygons — keep all floors, trim excess walls.
  if (polygons.length > 700) {
    const floors = polygons.filter((p) => p.type === "floor");
    const walls = polygons.filter((p) => p.type === "wall").slice(0, 700 - floors.length);
    return { polygons: [...floors, ...walls], rooms: roomsOut };
  }
  return { polygons, rooms: roomsOut };
}
