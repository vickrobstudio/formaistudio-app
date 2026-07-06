/**
 * Tiled AI detection for small plan symbols.
 *
 * Door swings and window symbols are a few dozen pixels on a full sheet —
 * below what vision models resolve reliably. Splitting the plan into 2×2
 * overlapping tiles quadruples the effective resolution, so the AI actually
 * sees the arcs and sill lines. Results are remapped to full-sheet
 * coordinates and deduplicated across the overlaps.
 */

export type TiledOpening = {
  type: string;
  points: Array<[number, number]>;
  confidence?: number;
};

type DetectResult =
  | { ok: true; polygons: Array<{ type: string; points: Array<[number, number]>; confidence?: number }> }
  | { ok: false; error: string };

const OPENING_TYPES = new Set(["door", "window", "stair", "column", "fixture", "cabinet"]);
const OVERLAP = 0.12;

function centroid(points: Array<[number, number]>): [number, number] {
  let cx = 0, cy = 0;
  for (const [x, y] of points) { cx += x; cy += y; }
  return [cx / points.length, cy / points.length];
}

export async function detectOpeningsTiled(
  imageDataUrl: string,
  detect: (input: { data: { imageDataUrl: string; imageWidth: number; imageHeight: number } }) => Promise<DetectResult>,
): Promise<TiledOpening[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode the plan image."));
    el.src = imageDataUrl;
  });
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (!W || !H) return [];

  // 2×2 tiles with overlap so symbols on the seams appear in full somewhere.
  const tileW = Math.round(W * (0.5 + OVERLAP));
  const tileH = Math.round(H * (0.5 + OVERLAP));
  const origins: Array<[number, number]> = [
    [0, 0],
    [W - tileW, 0],
    [0, H - tileH],
    [W - tileW, H - tileH],
  ];

  const tiles = origins.map(([ox, oy]) => {
    const canvas = document.createElement("canvas");
    canvas.width = tileW;
    canvas.height = tileH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tileW, tileH);
    ctx.drawImage(img, ox, oy, tileW, tileH, 0, 0, tileW, tileH);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), ox, oy };
  }).filter((t): t is { dataUrl: string; ox: number; oy: number } => t !== null);

  const results = await Promise.all(
    tiles.map((tile) =>
      detect({ data: { imageDataUrl: tile.dataUrl, imageWidth: tileW, imageHeight: tileH } })
        .then((res) => ({ tile, res }))
        .catch(() => null),
    ),
  );

  const found: TiledOpening[] = [];
  for (const item of results) {
    if (!item || !item.res.ok) continue;
    for (const poly of item.res.polygons) {
      if (!OPENING_TYPES.has(poly.type)) continue;
      // Tile-normalized → sheet-normalized.
      const points = poly.points.map(([x, y]) => [
        (item.tile.ox + x * tileW) / W,
        (item.tile.oy + y * tileH) / H,
      ] as [number, number]);
      found.push({ type: poly.type, points, confidence: poly.confidence });
    }
  }

  // Dedupe overlap doubles: same type with centroids closer than 1.5% of
  // the sheet are one symbol — keep the more confident.
  const kept: TiledOpening[] = [];
  for (const candidate of found.sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5))) {
    const [cx, cy] = centroid(candidate.points);
    const dupe = kept.some((existing) => {
      if (existing.type !== candidate.type) return false;
      const [ex, ey] = centroid(existing.points);
      return Math.hypot(cx - ex, cy - ey) < 0.015;
    });
    if (!dupe) kept.push(candidate);
  }
  return kept;
}
