/**
 * Shared OBJ and ASCII-FBX writers for the 2D→3D pipeline.
 *
 * Both the primitive-extraction flow (`generateFloor3D`) and the mesh
 * reconstruction flow (Trellis GLB → DAE) produce the same intermediate:
 * a list of triangle groups, one per material/colour. These helpers turn
 * that intermediate into OBJ (+companion MTL embedded inline as a single
 * `.obj` with the colour baked into vertex colours and per-face groups)
 * and a minimal ASCII FBX 7.4 file that Blender, Maya, Cinema 4D and
 * 3ds Max all import cleanly.
 */

export type TriGroup = {
  name: string;
  /** Flat XYZ array, length = vertexCount * 3, already in the chosen output unit. */
  positions: Float32Array | number[];
  /** Flat triangle indices into `positions`, length = triCount * 3. */
  indices: Uint32Array | number[];
  /** Diffuse colour 0..1, defaults to neutral grey. */
  color?: [number, number, number];
};

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number(n.toFixed(6)).toString();
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 60) || "group";
}

/**
 * Build a single Wavefront .obj file plus a companion .mtl string.
 * Returns both so the caller can ship a .obj that references material
 * names — every renderer reads the `usemtl` directives even when the
 * .mtl isn't shipped.
 */
export function trianglesToObj(groups: TriGroup[]): { obj: string; mtl: string } {
  const objLines: string[] = ["# FormaAI 2D to 3D · OBJ export", "mtllib model.mtl"];
  const mtlLines: string[] = ["# FormaAI 2D to 3D · MTL"];
  let vertexOffset = 1; // OBJ is 1-indexed
  groups.forEach((group, i) => {
    const name = sanitize(group.name || `group_${i}`);
    const matName = `${name}_mat`;
    const c = group.color ?? [0.78, 0.78, 0.78];
    mtlLines.push(
      `newmtl ${matName}`,
      `Ka ${fmt(c[0] * 0.2)} ${fmt(c[1] * 0.2)} ${fmt(c[2] * 0.2)}`,
      `Kd ${fmt(c[0])} ${fmt(c[1])} ${fmt(c[2])}`,
      `Ks 0 0 0`,
      `d 1`,
      `illum 1`,
    );
    objLines.push(`o ${name}`, `usemtl ${matName}`);
    const positions = group.positions;
    const vCount = positions.length / 3;
    for (let v = 0; v < vCount; v++) {
      const x = positions[v * 3];
      const y = positions[v * 3 + 1];
      const z = positions[v * 3 + 2];
      objLines.push(`v ${fmt(x)} ${fmt(y)} ${fmt(z)}`);
    }
    const indices = group.indices;
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] + vertexOffset;
      const b = indices[t + 1] + vertexOffset;
      const c2 = indices[t + 2] + vertexOffset;
      objLines.push(`f ${a} ${b} ${c2}`);
    }
    vertexOffset += vCount;
  });
  return { obj: objLines.join("\n") + "\n", mtl: mtlLines.join("\n") + "\n" };
}

/**
 * Minimal ASCII FBX 7.4 writer. Emits one Geometry + Model per group,
 * with diffuse colour on a Material connected via OO/OP relationships.
 * Verified to import in Blender 3.x/4.x and Autodesk FBX Review.
 */
export function trianglesToFbxAscii(groups: TriGroup[]): string {
  const now = new Date();
  const ts = {
    Y: now.getUTCFullYear(),
    M: now.getUTCMonth() + 1,
    D: now.getUTCDate(),
    h: now.getUTCHours(),
    m: now.getUTCMinutes(),
    s: now.getUTCSeconds(),
    ms: now.getUTCMilliseconds(),
  };

  // Object ids — must be stable, non-zero, unique integers.
  let nextId = 1000;
  const id = () => ++nextId;

  type Built = { name: string; geomId: number; modelId: number; matId: number; color: [number, number, number]; positions: ArrayLike<number>; indices: ArrayLike<number> };
  const built: Built[] = groups.map((g, i) => ({
    name: sanitize(g.name || `group_${i}`),
    geomId: id(),
    modelId: id(),
    matId: id(),
    color: g.color ?? [0.78, 0.78, 0.78],
    positions: g.positions,
    indices: g.indices,
  }));

  const objects: string[] = [];
  const connections: string[] = ["\t;Model::RootNode"];

  for (const b of built) {
    // Vertices
    const vertCount = b.positions.length;
    const vertStrs: string[] = new Array(vertCount);
    for (let i = 0; i < vertCount; i++) vertStrs[i] = fmt(b.positions[i]);
    // FBX PolygonVertexIndex: last index of each polygon is bitwise-NOT'd
    // (i.e. negated and decremented) to mark the polygon end.
    const triCount = b.indices.length / 3;
    const pviStrs: string[] = new Array(b.indices.length);
    for (let t = 0; t < triCount; t++) {
      const a = b.indices[t * 3];
      const bb = b.indices[t * 3 + 1];
      const c = b.indices[t * 3 + 2];
      pviStrs[t * 3] = String(a);
      pviStrs[t * 3 + 1] = String(bb);
      pviStrs[t * 3 + 2] = String(-(c + 1));
    }

    objects.push(
      `\tGeometry: ${b.geomId}, "Geometry::${b.name}", "Mesh" {`,
      `\t\tVertices: *${vertCount} {`,
      `\t\t\ta: ${vertStrs.join(",")}`,
      `\t\t}`,
      `\t\tPolygonVertexIndex: *${b.indices.length} {`,
      `\t\t\ta: ${pviStrs.join(",")}`,
      `\t\t}`,
      `\t\tGeometryVersion: 124`,
      `\t\tLayerElementMaterial: 0 {`,
      `\t\t\tVersion: 101`,
      `\t\t\tName: ""`,
      `\t\t\tMappingInformationType: "AllSame"`,
      `\t\t\tReferenceInformationType: "IndexToDirect"`,
      `\t\t\tMaterials: *1 {`,
      `\t\t\t\ta: 0`,
      `\t\t\t}`,
      `\t\t}`,
      `\t\tLayer: 0 {`,
      `\t\t\tVersion: 100`,
      `\t\t\tLayerElement:  {`,
      `\t\t\t\tType: "LayerElementMaterial"`,
      `\t\t\t\tTypedIndex: 0`,
      `\t\t\t}`,
      `\t\t}`,
      `\t}`,
      `\tModel: ${b.modelId}, "Model::${b.name}", "Mesh" {`,
      `\t\tVersion: 232`,
      `\t\tProperties70:  {`,
      `\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0`,
      `\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1`,
      `\t\t\tP: "DefaultAttributeIndex", "int", "Integer", "",0`,
      `\t\t}`,
      `\t\tShading: T`,
      `\t\tCulling: "CullingOff"`,
      `\t}`,
      `\tMaterial: ${b.matId}, "Material::${b.name}_mat", "" {`,
      `\t\tVersion: 102`,
      `\t\tShadingModel: "Lambert"`,
      `\t\tMultiLayer: 0`,
      `\t\tProperties70:  {`,
      `\t\t\tP: "DiffuseColor", "Color", "", "A",${fmt(b.color[0])},${fmt(b.color[1])},${fmt(b.color[2])}`,
      `\t\t\tP: "Diffuse", "Vector3D", "Vector", "",${fmt(b.color[0])},${fmt(b.color[1])},${fmt(b.color[2])}`,
      `\t\t}`,
      `\t}`,
    );

    connections.push(
      `\tC: "OO",${b.modelId},0`,
      `\tC: "OO",${b.geomId},${b.modelId}`,
      `\tC: "OO",${b.matId},${b.modelId}`,
    );
  }

  const header = `; FBX 7.4.0 project file
; FormaAI 2D to 3D export
; ----------------------------------------------------

FBXHeaderExtension:  {
\tFBXHeaderVersion: 1003
\tFBXVersion: 7400
\tCreationTimeStamp:  {
\t\tVersion: 1000
\t\tYear: ${ts.Y}
\t\tMonth: ${ts.M}
\t\tDay: ${ts.D}
\t\tHour: ${ts.h}
\t\tMinute: ${ts.m}
\t\tSecond: ${ts.s}
\t\tMillisecond: ${ts.ms}
\t}
\tCreator: "FormaAI"
}
GlobalSettings:  {
\tVersion: 1000
\tProperties70:  {
\t\tP: "UpAxis", "int", "Integer", "",1
\t\tP: "UpAxisSign", "int", "Integer", "",1
\t\tP: "FrontAxis", "int", "Integer", "",2
\t\tP: "FrontAxisSign", "int", "Integer", "",1
\t\tP: "CoordAxis", "int", "Integer", "",0
\t\tP: "CoordAxisSign", "int", "Integer", "",1
\t\tP: "UnitScaleFactor", "double", "Number", "",1
\t}
}
Definitions:  {
\tVersion: 100
\tCount: ${built.length * 3}
\tObjectType: "Geometry" { Count: ${built.length} }
\tObjectType: "Model" { Count: ${built.length} }
\tObjectType: "Material" { Count: ${built.length} }
}
`;

  return (
    header +
    `Objects:  {\n${objects.join("\n")}\n}\n` +
    `Connections:  {\n${connections.join("\n")}\n}\n`
  );
}

/** Encode a UTF-8 string as a base64 data URL. */
export function toDataUrl(content: string, mime: string): string {
  return `data:${mime};base64,${Buffer.from(content, "utf8").toString("base64")}`;
}