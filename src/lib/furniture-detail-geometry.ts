import { CatmullRomCurve3, TubeGeometry, Vector3 } from "three";

/** A separately selectable trim mesh, shared by preview and every export. */
export function addFurniturePiping(
  group: { positions: number[]; indices: number[] },
  part: { path?: number[][]; closed?: boolean; tubeDiameter?: number; width: number; depth: number; height: number; cx: number; cy: number; cz: number; rotationDegZ: number },
  scale: number,
) {
  const points = (part.path ?? []).map(([x, y, z]) => new Vector3(x * part.width, y * part.depth, z * part.height))
    .filter((p, i, all) => i === 0 || p.distanceToSquared(all[i - 1]) > 1e-12);
  if (part.closed && points.length > 2 && points[0].distanceToSquared(points[points.length - 1]) < 1e-12) points.pop();
  if (points.length < 2 || (part.closed && points.length < 3)) throw new Error("Piping requires a non-empty seam path");
  const curve = new CatmullRomCurve3(points, part.closed ?? false, "centripetal");
  const radial = 8, segments = Math.max(16, points.length * 4);
  const geometry = new TubeGeometry(curve, segments, (part.tubeDiameter ?? 0.004) / 2, radial, part.closed ?? false);
  geometry.rotateZ(part.rotationDegZ * Math.PI / 180);
  geometry.translate(part.cx, part.cy, part.cz);
  const offset = group.positions.length / 3;
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) group.positions.push(positions.getX(i) * scale, positions.getY(i) * scale, positions.getZ(i) * scale);
  for (const index of geometry.index!.array) group.indices.push(offset + index);
  if (!part.closed) {
    // Cap both ends, retaining the tube's outward winding.
    for (const [ring, reverse] of [[0, true], [segments * (radial + 1), false]] as const) {
      for (let i = 1; i < radial - 1; i++) group.indices.push(offset + ring, offset + ring + (reverse ? i + 1 : i), offset + ring + (reverse ? i : i + 1));
    }
  }
  geometry.dispose();
}
