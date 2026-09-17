import type { TriGroup } from "./mesh-export.server";

/**
 * Minimal parser for the Collada documents produced by `buildDae` in
 * `floor-3d.functions.ts` and `glbToDae` in `glb-to-dae.server.ts`.
 * It walks every `<geometry>` block, reads the POSITION `<float_array>`
 * and the `<triangles>` `<p>` index list, and picks the diffuse colour
 * from the matching `<effect>`. Returns one `TriGroup` per geometry so
 * the OBJ / FBX writers preserve the same material grouping.
 */
export function parseDaeToTriangles(dae: string): TriGroup[] {
  // Map effect-id → diffuse rgb
  const effectColors = new Map<string, [number, number, number]>();
  const effectRe = /<effect\s+id="([^"]+)"[\s\S]*?<diffuse>\s*<color[^>]*>\s*([-0-9.eE\s]+)\s*<\/color>\s*<\/diffuse>[\s\S]*?<\/effect>/g;
  let em: RegExpExecArray | null;
  while ((em = effectRe.exec(dae))) {
    const id = em[1];
    const parts = em[2].trim().split(/\s+/).map(Number);
    if (parts.length >= 3) effectColors.set(id, [parts[0], parts[1], parts[2]]);
  }

  // Map material-id → effect-id
  const materialEffect = new Map<string, string>();
  const matRe = /<material\s+id="([^"]+)"[^>]*>\s*<instance_effect\s+url="#([^"]+)"\s*\/>/g;
  let mm: RegExpExecArray | null;
  while ((mm = matRe.exec(dae))) {
    materialEffect.set(mm[1], mm[2].replace(/-effect$/, "-effect"));
  }

  const groups: TriGroup[] = [];
  const geomRe = /<geometry\s+id="([^"]+)"\s+name="([^"]*)">[\s\S]*?<mesh>([\s\S]*?)<\/mesh>\s*<\/geometry>/g;
  let gm: RegExpExecArray | null;
  while ((gm = geomRe.exec(dae))) {
    const name = gm[2] || gm[1];
    const mesh = gm[3];
    // Positions: the first <source> with id ending -pos
    // Both emitters must parse: glb-to-dae writes `…-pos`, buildDae writes `…_pos`.
    const posMatch = mesh.match(/<source\s+id="[^"]*[-_]pos"[\s\S]*?<float_array[^>]*>([\s\S]*?)<\/float_array>/);
    if (!posMatch) continue;
    const positions = posMatch[1].trim().split(/\s+/).map(Number);

    const triMatch = mesh.match(/<triangles[^>]*material="([^"]*)"[^>]*>([\s\S]*?)<\/triangles>/);
    if (!triMatch) continue;
    const matBinding = triMatch[1];
    const triBody = triMatch[2];
    // Count inputs to compute stride
    const inputCount = (triBody.match(/<input\b/g) || []).length || 1;
    const pMatch = triBody.match(/<p>([\s\S]*?)<\/p>/);
    if (!pMatch) continue;
    const raw = pMatch[1].trim().split(/\s+/).map(Number);
    const triCount = raw.length / inputCount / 3;
    const indices: number[] = new Array(triCount * 3);
    for (let t = 0; t < triCount * 3; t++) indices[t] = raw[t * inputCount];

    // Colour: material binding → material → effect → diffuse
    let color: [number, number, number] | undefined;
    const matId = matBinding.replace(/(?:-binding|_sg)$/, "");
    const fxId = materialEffect.get(matId);
    if (fxId) color = effectColors.get(fxId) ?? effectColors.get(fxId.replace(/-effect$/, "") + "-effect");

    groups.push({ name, positions, indices, color });
  }
  return groups;
}
