import earcut from "earcut";
import { cleanPlanPolygon } from "./architectural-measurement.ts";
export function extrudePolygonIntoGroup(
  group: { positions: number[]; indices: number[] },
  poly: Array<[number, number]>,
  z0: number,
  z1: number,
  scale: number,
) {
  poly = cleanPlanPolygon(poly);
  const flat: number[] = [];
  for (const [x, y] of poly) flat.push(x, y);
  const tris = earcut(flat);
  if (tris.length === 0) return;
  const baseIndex = group.positions.length / 3;
  // Bottom ring
  for (const [x, y] of poly) group.positions.push(x * scale, y * scale, z0 * scale);
  // Top ring
  for (const [x, y] of poly) group.positions.push(x * scale, y * scale, z1 * scale);
  const n = poly.length;
  // Bottom (reversed for outward normal)
  for (let i = 0; i < tris.length; i += 3) {
    group.indices.push(baseIndex + tris[i + 2], baseIndex + tris[i + 1], baseIndex + tris[i]);
  }
  // Top
  for (let i = 0; i < tris.length; i += 3) {
    group.indices.push(baseIndex + n + tris[i], baseIndex + n + tris[i + 1], baseIndex + n + tris[i + 2]);
  }
  // Sides
  for (let i = 0; i < n; i += 1) {
    const a = baseIndex + i;
    const b = baseIndex + ((i + 1) % n);
    const c = baseIndex + n + ((i + 1) % n);
    const d = baseIndex + n + i;
    group.indices.push(a, b, c, a, c, d);
  }
}



