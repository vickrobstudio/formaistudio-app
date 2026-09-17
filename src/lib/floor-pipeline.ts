// Floor-plan pipeline (client-side, pure).
//
// Given a binary line mask (1 = line pixel, 0 = empty), extract every
// enclosed background region as a real vector polygon — not a bounding
// box. Uses Moore-neighbor contour tracing on a per-region mask and
// Ramer-Douglas-Peucker to simplify the trace down to a small,
// editable polygon.
//
// This is step 7 ("Polygonize") of the floor-plan pipeline.

export type RoomRegion = {
  /** Pixel indices that belong to the enclosed region. */
  pixels: number[];
  /** Tight axis-aligned bbox in pixel coords [minX, minY, maxX, maxY]. */
  bbox: [number, number, number, number];
  /** Polygon outline in pixel coords, simplified (clockwise). */
  contourPx: Array<[number, number]>;
  /** Same polygon, normalized to 0..1 of the source canvas. */
  polygon: Array<[number, number]>;
};

/**
 * Virtual door closure (pipeline step 2).
 *
 * Door openings, archways, and small drafting gaps leave the wall mask
 * non-watertight, so flood-fill would leak from a room into the corridor
 * and merge them into one giant blob. We seal these holes BEFORE the
 * fill by running a binary morphological closing (dilate → erode) on
 * the line mask.
 *
 *   - dilate(r) grows every wall pixel by `r` in every direction, which
 *     bridges any gap up to roughly 2·r pixels (the typical door is
 *     ~80–100 cm; at a 2400-px wide plan that's ~10–14 px, so r ≈ 6–8
 *     closes most openings without fattening real walls beyond
 *     recognition).
 *   - erode(r) then shrinks every wall back to its original thickness,
 *     so the only pixels that survive in the closed mask are: real
 *     walls + newly-bridged door gaps.
 *
 * The original mask is returned unchanged; the closed mask is the one
 * we hand to `extractRoomRegions`.
 */
export function closeOpenings(
  mask: Uint8Array,
  w: number,
  h: number,
  radius = 6,
): Uint8Array {
  const r = Math.max(1, Math.min(20, radius));
  const dilated = dilate(mask, w, h, r);
  return erode(dilated, w, h, r);
}

function dilate(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // Two-pass (horizontal then vertical) max filter — separable, so O(N·r)
  // instead of O(N·r²). For a binary mask "max" is just "any neighbour is 1".
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      const xMin = Math.max(0, x - r), xMax = Math.min(w - 1, x + r);
      for (let k = xMin; k <= xMax; k++) {
        if (src[row + k]) { v = 1; break; }
      }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0;
      const yMin = Math.max(0, y - r), yMax = Math.min(h - 1, y + r);
      for (let k = yMin; k <= yMax; k++) {
        if (tmp[k * w + x]) { v = 1; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function erode(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 1;
      const xMin = Math.max(0, x - r), xMax = Math.min(w - 1, x + r);
      for (let k = xMin; k <= xMax; k++) {
        if (!src[row + k]) { v = 0; break; }
      }
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 1;
      const yMin = Math.max(0, y - r), yMax = Math.min(h - 1, y + r);
      for (let k = yMin; k <= yMax; k++) {
        if (!tmp[k * w + x]) { v = 0; break; }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/**
 * Walk the line mask once and return every enclosed background region
 * (connected component of 0-pixels that does not touch the image edge)
 * as a traced + simplified polygon.
 */
export function extractRoomRegions(
  mask: Uint8Array,
  w: number,
  h: number,
  opts: { minAreaPx?: number; maxRegions?: number; simplifyPx?: number } = {},
): RoomRegion[] {
  const minArea = opts.minAreaPx ?? Math.max(120, Math.round(w * h * 0.00015));
  const maxRegions = opts.maxRegions ?? 400;
  const simplifyPx = opts.simplifyPx ?? Math.max(2, Math.round(Math.max(w, h) * 0.002));

  const visited = new Uint8Array(w * h);
  const out: RoomRegion[] = [];

  for (let p = 0; p < mask.length; p++) {
    if (visited[p] || mask[p] === 1) continue;
    // 4-connected flood fill from this background pixel.
    const stack = [p];
    const pixels: number[] = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let touchedEdge = false;
    while (stack.length) {
      const q = stack.pop()!;
      if (visited[q]) continue;
      visited[q] = 1;
      if (mask[q] === 1) continue;
      pixels.push(q);
      const x = q % w, y = (q - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchedEdge = true;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0) stack.push(q - 1);
      if (x < w - 1) stack.push(q + 1);
      if (y > 0) stack.push(q - w);
      if (y < h - 1) stack.push(q + w);
    }
    if (touchedEdge) continue;
    if (pixels.length < minArea) continue;

    // Build a small per-region mask sized to its bbox (+1 px padding so
    // contour tracing has a clean exterior on every side).
    const rw = maxX - minX + 3;
    const rh = maxY - minY + 3;
    const local = new Uint8Array(rw * rh);
    for (const px of pixels) {
      const x = px % w, y = (px - x) / w;
      local[(y - minY + 1) * rw + (x - minX + 1)] = 1;
    }
    const trace = mooreContour(local, rw, rh);
    if (!trace || trace.length < 4) continue;
    const simplified = rdp(trace, simplifyPx);
    // Lift back to source-canvas coords.
    const contourPx = simplified.map(([x, y]) => [x + minX - 1, y + minY - 1] as [number, number]);
    const polygon = contourPx.map(([x, y]) => [x / w, y / h] as [number, number]);

    out.push({
      pixels,
      bbox: [minX, minY, maxX, maxY],
      contourPx,
      polygon,
    });
    if (out.length >= maxRegions) break;
  }
  out.sort((a, b) => b.pixels.length - a.pixels.length);
  return out;
}

/**
 * Moore-neighbor contour trace on a binary mask. Starts at the leftmost-
 * topmost set pixel and walks clockwise until returning to the start.
 */
function mooreContour(m: Uint8Array, w: number, h: number): Array<[number, number]> | null {
  // Find start: first set pixel scanning row-by-row.
  let sx = -1, sy = -1;
  for (let y = 0; y < h && sy < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (m[y * w + x]) { sx = x; sy = y; break; }
    }
  }
  if (sx < 0) return null;

  const dirs: Array<[number, number]> = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  const contour: Array<[number, number]> = [[sx, sy]];
  let cx = sx, cy = sy;
  // Previous direction = "came from the left" => start checking above.
  let prevDir = 6;
  let safety = w * h * 4;

  while (safety-- > 0) {
    let found = false;
    // Start checking from the neighbor counter-clockwise of the previous
    // backtrack direction. Classic Moore trace.
    const startDir = (prevDir + 6) % 8;
    for (let i = 0; i < 8; i++) {
      const d = (startDir + i) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (m[ny * w + nx]) {
        // Move to that neighbor; record entry direction.
        cx = nx; cy = ny;
        prevDir = d;
        contour.push([cx, cy]);
        found = true;
        break;
      }
    }
    if (!found) break;
    // Stop after we revisit the start with a previous step recorded.
    if (cx === sx && cy === sy && contour.length > 2) break;
  }
  return contour;
}

/** Ramer-Douglas-Peucker polyline simplification. */
function rdp(points: Array<[number, number]>, epsilon: number): Array<[number, number]> {
  if (points.length < 4) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let maxI = -1;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const t = ((px - ax) * dx + (py - ay) * dy) / len2;
      const qx = ax + t * dx, qy = ay + t * dy;
      const ex = px - qx, ey = py - qy;
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxI >= 0 && Math.sqrt(maxD) > epsilon) {
      keep[maxI] = 1;
      stack.push([a, maxI]);
      stack.push([maxI, b]);
    }
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * Render a numbered thumbnail of the cleaned drawing with each region's
 * outline + index drawn on top. Used as the visual the AI classifier
 * sees, alongside the JSON list of region indices and bboxes.
 */
export function buildClassifierThumbnail(
  source: HTMLCanvasElement,
  regions: RoomRegion[],
  maxLongSide = 1100,
): { dataUrl: string; width: number; height: number; scale: number } {
  const scale = Math.min(1, maxLongSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context for classifier thumbnail.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  ctx.lineWidth = Math.max(1, Math.round(Math.max(w, h) * 0.0025));
  ctx.font = `bold ${Math.max(11, Math.round(Math.max(w, h) * 0.018))}px ui-sans-serif, system-ui`;
  regions.forEach((reg, i) => {
    if (reg.contourPx.length < 3) return;
    ctx.strokeStyle = "rgba(220,38,38,0.95)";
    ctx.fillStyle = "rgba(220,38,38,0.10)";
    ctx.beginPath();
    for (let p = 0; p < reg.contourPx.length; p++) {
      const [x, y] = reg.contourPx[p];
      const sx = x * scale, sy = y * scale;
      if (p === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Label centroid (bbox center) with the region index.
    const cx = ((reg.bbox[0] + reg.bbox[2]) / 2) * scale;
    const cy = ((reg.bbox[1] + reg.bbox[3]) / 2) * scale;
    const label = String(i + 1);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(17,17,17,0.92)";
    ctx.fillRect(cx - tw / 2 - 4, cy - 12, tw + 8, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, cx - tw / 2, cy + 4);
  });
  return { dataUrl: canvas.toDataURL("image/png"), width: w, height: h, scale };
}

/**
 * Build a per-region binary mask as a PNG data URL. Pixels inside the
 * region are black-opaque, outside is transparent. Used downstream by
 * material/3D layers as a "Photoshop layer per room".
 */
export function buildRegionMaskDataUrl(
  region: RoomRegion,
  w: number,
  h: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const id = ctx.createImageData(w, h);
  for (const p of region.pixels) {
    const i = p * 4;
    id.data[i] = 0; id.data[i + 1] = 0; id.data[i + 2] = 0; id.data[i + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return canvas.toDataURL("image/png");
}
