/**
 * Minimal binary glTF 2.0 (.glb) writer for the building/floor exports.
 * Hand-rolled on purpose: the Nitro server runtime has no DOM, so three.js's
 * GLTFExporter (FileReader/Blob/canvas paths) is unusable here, and the
 * geometry is simple — untextured triangle groups with flat colours. The
 * binary chunk layout mirrors the reader in `glb-to-dae.server.ts`.
 *
 * Coordinate system: our geometry is Z-up; glTF is Y-up. A single root node
 * carries a −90° X rotation so vertex data is written untouched.
 */
import { MATERIAL_PALETTE, type MaterialId } from "./floor-3d-shared.ts";

export type GlbGroup = {
  id: string;
  name: string;
  positions: number[];
  indices: number[];
  materialId: MaterialId;
  colorOverride?: [number, number, number];
  parentPath?: string[];
};

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const FLOAT = 5126;
const UNSIGNED_INT = 5125;

type GltfNode = { name: string; mesh?: number; rotation?: number[]; children?: number[] };

/**
 * @param outputUnits units the group positions are in. glTF has no unit tag —
 * it is always meters — so feet-based geometry is converted on write.
 */
export function trianglesToGlb(
  groups: GlbGroup[],
  outputUnits: "meters" | "feet" = "meters",
): Uint8Array {
  const toMeters = outputUnits === "feet" ? 0.3048 : 1;
  const usable = groups.filter((g) => g.positions.length >= 9 && g.indices.length >= 3);

  // ── Binary buffer: per group, positions (Float32) then indices (Uint32).
  const bufferParts: Uint8Array[] = [];
  const bufferViews: Array<Record<string, unknown>> = [];
  const accessors: Array<Record<string, unknown>> = [];
  const materials: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];
  let byteOffset = 0;

  const pushView = (bytes: Uint8Array, target: number) => {
    const viewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength, target });
    bufferParts.push(bytes);
    byteOffset += bytes.byteLength;
    // 4-byte alignment between views (accessor componentType alignment rule).
    const pad = (4 - (byteOffset % 4)) % 4;
    if (pad) {
      bufferParts.push(new Uint8Array(pad));
      byteOffset += pad;
    }
    return viewIndex;
  };

  usable.forEach((g, i) => {
    const positions = new Float32Array(g.positions.length);
    for (let p = 0; p < g.positions.length; p++) positions[p] = g.positions[p] * toMeters;
    const indices = new Uint32Array(g.indices);

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let p = 0; p < positions.length; p += 3) {
      for (let axis = 0; axis < 3; axis++) {
        const v = positions[p + axis];
        if (v < min[axis]) min[axis] = v;
        if (v > max[axis]) max[axis] = v;
      }
    }

    const posView = pushView(new Uint8Array(positions.buffer.slice(0)), ARRAY_BUFFER);
    const posAccessor = accessors.length;
    accessors.push({
      bufferView: posView,
      componentType: FLOAT,
      count: positions.length / 3,
      type: "VEC3",
      min,
      max,
    });

    const idxView = pushView(new Uint8Array(indices.buffer.slice(0)), ELEMENT_ARRAY_BUFFER);
    const idxAccessor = accessors.length;
    accessors.push({
      bufferView: idxView,
      componentType: UNSIGNED_INT,
      count: indices.length,
      type: "SCALAR",
    });

    const spec = MATERIAL_PALETTE[g.materialId];
    const [r, gr, b] = g.colorOverride ?? spec.color;
    const alpha = spec.transmission && spec.transmission > 0 ? 1 - spec.transmission : 1;
    materials.push({
      name: g.name,
      pbrMetallicRoughness: {
        baseColorFactor: [r, gr, b, alpha],
        metallicFactor: spec.metalness ?? 0,
        roughnessFactor: spec.roughness ?? 0.9,
      },
      ...(alpha < 1 ? { alphaMode: "BLEND" } : {}),
      doubleSided: true,
    });

    meshes.push({
      name: g.name,
      primitives: [
        { attributes: { POSITION: posAccessor }, indices: idxAccessor, material: i, mode: 4 },
      ],
    });
  });

  // ── Node hierarchy from parentPath, all under one Z-up→Y-up root.
  const nodes: GltfNode[] = [
    { name: "Scene", rotation: [-0.7071068, 0, 0, 0.7071068], children: [] },
  ];
  const folderIndex = new Map<string, number>();
  const folderFor = (path: string[]): number => {
    if (path.length === 0) return 0;
    const key = path.join("//");
    const existing = folderIndex.get(key);
    if (existing !== undefined) return existing;
    const parent = folderFor(path.slice(0, -1));
    const idx = nodes.length;
    nodes.push({ name: path[path.length - 1], children: [] });
    (nodes[parent].children ??= []).push(idx);
    folderIndex.set(key, idx);
    return idx;
  };
  usable.forEach((g, i) => {
    const parent = folderFor(g.parentPath ?? []);
    const idx = nodes.length;
    nodes.push({ name: g.name, mesh: i });
    (nodes[parent].children ??= []).push(idx);
  });

  const gltf = {
    asset: { version: "2.0", generator: "FormAI Studio 2D-to-3D" },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [0] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  // ── Assemble chunks: 12-byte header + JSON chunk (space-padded) + BIN chunk.
  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const jsonLength = jsonBytes.byteLength + jsonPad;

  const binLength = byteOffset; // already 4-byte aligned by pushView
  const total = 12 + 8 + jsonLength + 8 + binLength;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let cursor = 0;
  dv.setUint32(cursor, GLB_MAGIC, true);
  cursor += 4;
  dv.setUint32(cursor, 2, true);
  cursor += 4;
  dv.setUint32(cursor, total, true);
  cursor += 4;

  dv.setUint32(cursor, jsonLength, true);
  cursor += 4;
  dv.setUint32(cursor, CHUNK_JSON, true);
  cursor += 4;
  out.set(jsonBytes, cursor);
  cursor += jsonBytes.byteLength;
  for (let i = 0; i < jsonPad; i++) out[cursor++] = 0x20; // pad with spaces

  dv.setUint32(cursor, binLength, true);
  cursor += 4;
  dv.setUint32(cursor, CHUNK_BIN, true);
  cursor += 4;
  for (const part of bufferParts) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }

  return out;
}

export function glbToDataUrlBinary(glb: Uint8Array): string {
  return `data:model/gltf-binary;base64,${Buffer.from(glb).toString("base64")}`;
}
