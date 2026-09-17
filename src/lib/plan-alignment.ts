export type Outline = { id: string; type: string; points: Array<[number, number]> };
type Transform = { sx: number; sy: number; dx: number; dy: number };
const identity: Transform = { sx: 1, sy: 1, dx: 0, dy: 0 };
const mapPoint = ([x, y]: [number, number], t: Transform): [number, number] => [(x - .5) * t.sx + .5 + t.dx, (y - .5) * t.sy + .5 + t.dy];
function inside(x: number, y: number, p: Array<[number, number]>) {
  let hit = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) hit = !hit;
  }
  return hit;
}
/** Conservative registration of AI wall footprints to dark ink; never rotates or changes manual outlines. */
export function alignPlanToInk<T extends Outline>(polygons: T[], ink: Uint8Array, width: number, height: number) {
  const walls = polygons.filter(p => p.type === "wall" && !p.id.startsWith("man_"));
  const samples: Array<[number, number]> = [];
  for (const wall of walls) {
    const xs = wall.points.map(p => p[0]), ys = wall.points.map(p => p[1]);
    const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(1, Math.max(...xs));
    const y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(1, Math.max(...ys));
    const nx = Math.max(3, Math.ceil((x1 - x0) * 160)), ny = Math.max(3, Math.ceil((y1 - y0) * 160));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + (i + .5) / nx * (x1 - x0), y = y0 + (j + .5) / ny * (y1 - y0);
      if (inside(x, y, wall.points)) samples.push([x, y]);
    }
  }
  if (!walls.length || samples.length < 12 || ink.length !== width * height) return { polygons, changed: false, confidence: 0 };
  const step = Math.max(1, Math.ceil(samples.length / 2000));
  const score = (t: Transform) => {
    let total = 0, count = 0;
    for (let i = 0; i < samples.length; i += step) {
      const [x, y] = mapPoint(samples[i], t);
      const px = Math.floor(x * width), py = Math.floor(y * height);
      total += px >= 0 && px < width && py >= 0 && py < height ? ink[py * width + px] / 255 : 0;
      count++;
    }
    return total / count;
  };
  let best = { ...identity }, bestScore = score(best);
  const before = bestScore;
  // Search translation first, then refine affine scale/translation together.
  for (let dx = -.08; dx <= .081; dx += .02) for (let dy = -.08; dy <= .081; dy += .02) {
    const t = { ...identity, dx, dy }, s = score(t);
    if (s > bestScore + .001) { best = t; bestScore = s; }
  }
  for (const delta of [.08, .04, .02, .01, .005]) for (let pass = 0; pass < 3; pass++) {
    for (const key of ["sx", "sy", "dx", "dy"] as const) {
      for (const sign of [-1, 1]) {
        const t = { ...best, [key]: best[key] + delta * sign };
        if (t.sx < .8 || t.sx > 1.2 || t.sy < .8 || t.sy > 1.2 || Math.abs(t.dx) > .1 || Math.abs(t.dy) > .1) continue;
        const s = score(t);
        if (s > bestScore + .002) { best = t; bestScore = s; }
      }
    }
  }
  const candidates = polygons.map(p => p.id.startsWith("man_") ? p : { ...p, points: p.points.map(point => mapPoint(point, best)) });
  const outOfBounds = candidates.some(p => p.points.some(pt => pt.some(v => v < 0 || v > 1)));
  if (bestScore < .6 || bestScore - before < .08 || outOfBounds) return { polygons, changed: false, confidence: bestScore };
  return { polygons: candidates, changed: true, confidence: bestScore };
}
