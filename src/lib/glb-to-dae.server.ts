/** Export the reconstructed mesh; a photo reconstruction is not an exact replica.
 * Texture files are supplied separately in the SketchUp ZIP download. */

type Accessor = {
  normalized?: boolean;
  bufferView: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: "SCALAR" | "VEC2" | "VEC3" | "VEC4" | "MAT2" | "MAT3" | "MAT4";
};

type BufferView = {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
};

const COMPONENT_SIZE: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};
const TYPE_ELEMENTS: Record<string, number> = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16,
};

function parseGlb(glb: Uint8Array): { json: Record<string, unknown>; bin: Uint8Array } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const magic = dv.getUint32(0, true);
  if (magic !== 0x46546c67) throw new Error("Not a GLB file (bad magic).");
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported GLB version ${version}.`);
  const total = dv.getUint32(8, true);
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let bin: Uint8Array | null = null;
  while (offset < total) {
    const chunkLength = dv.getUint32(offset, true);
    const chunkType = dv.getUint32(offset + 4, true);
    const data = glb.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
    } else if (chunkType === 0x004e4942) {
      bin = data;
    }
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error("GLB missing JSON chunk.");
  return { json, bin: bin ?? new Uint8Array() };
}

function readAccessor(json: Record<string, unknown>, bin: Uint8Array, index: number): { values: Float32Array | Uint32Array; elements: number; count: number } {
  const accessors = (json.accessors as Accessor[]) ?? [];
  const bufferViews = (json.bufferViews as BufferView[]) ?? [];
  const accessor = accessors[index];
  if (!accessor) throw new Error(`Accessor ${index} missing.`);
  const view = bufferViews[accessor.bufferView];
  if (!view) throw new Error(`BufferView ${accessor.bufferView} missing.`);
  const elements = TYPE_ELEMENTS[accessor.type];
  const compSize = COMPONENT_SIZE[accessor.componentType] ?? 4;
  const byteOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = accessor.componentType === 5126 || accessor.normalized ? new Float32Array(accessor.count * elements) : new Uint32Array(accessor.count * elements);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const stride = view.byteStride ?? elements * compSize;
  for (let i=0;i<accessor.count;i++) for(let j=0;j<elements;j++) {
    const offset=byteOffset+i*stride+j*compSize;
    let value: number;
    switch(accessor.componentType) {
      case 5126: value=dv.getFloat32(offset,true); break;
      case 5125: value=dv.getUint32(offset,true); break;
      case 5123: value=dv.getUint16(offset,true); if(accessor.normalized) value/=65535; break;
      case 5121: value=dv.getUint8(offset); if(accessor.normalized) value/=255; break;
      default: throw new Error(`Unsupported component type ${accessor.componentType}`);
    }
    values[i*elements+j]=value;
  }
  return { values, elements, count: accessor.count };
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number(n.toFixed(6)).toString();
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
}

export function glbToDae(
  glbBytes: Uint8Array,
  options: {
    units?: "meters" | "feet";
    texturePaths?: Record<number, string>;
    /**
     * Target real-world bounding box in METERS, taken from the 2D plan.
     * Trellis returns a normalised mesh (~unit cube). When supplied, the
     * mesh is non-uniformly scaled so its bounding box matches the plan
     * width/depth/height exactly — i.e. the downloadable .dae has the
     * dimensions the user typed into the plan.
     */
    targetBoundsMeters?: { width: number; depth: number; height: number };
  } = {},
): string {
  const { json, bin } = parseGlb(glbBytes);
  const meshes = (json.meshes as Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; material?: number; mode?: number }>; name?: string }>) ?? [];
  if (!meshes.length) throw new Error("GLB contains no meshes.");

  type Tri = {
    positions: Float32Array;
    normals: Float32Array | null;
    uvs: Float32Array | null;
    colors: Float32Array | null;
    indices: Uint32Array;
    name: string;
    material?: number;
  };
  const tris: Tri[] = [];

  meshes.forEach((mesh, meshIdx) => {
    mesh.primitives.forEach((prim, primIdx) => {
      const mode = prim.mode ?? 4;
      if (mode !== 4) return; // only TRIANGLES
      const posIdx = prim.attributes.POSITION;
      if (posIdx === undefined) return;
      const positions = readAccessor(json, bin, posIdx).values as Float32Array;
      const normals = prim.attributes.NORMAL !== undefined
        ? readAccessor(json, bin, prim.attributes.NORMAL).values as Float32Array
        : null;
      const uvs = prim.attributes.TEXCOORD_0 !== undefined
        ? readAccessor(json, bin, prim.attributes.TEXCOORD_0).values as Float32Array
        : null;
      const colors = prim.attributes.COLOR_0 !== undefined
        ? readAccessor(json, bin, prim.attributes.COLOR_0).values as Float32Array
        : null;
      let indices: Uint32Array;
      if (prim.indices !== undefined) {
        indices = readAccessor(json, bin, prim.indices).values as Uint32Array;
      } else {
        const n = positions.length / 3;
        indices = new Uint32Array(n);
        for (let i = 0; i < n; i++) indices[i] = i;
      }
      tris.push({
        positions,
        material: prim.material,
        normals,
        uvs,
        colors,
        indices,
        name: `${mesh.name || `mesh_${meshIdx}`}_p${primIdx}`,
      });
    });
  });

  if (!tris.length) throw new Error("No triangle primitives found.");

  const unit = options.units === "feet" ? 0.3048 : 1;
  const unitName = options.units === "feet" ? "foot" : "meter";

  // Compute the mesh bounding box across all primitives so we can scale to
  // the plan's real-world dimensions. Trellis uses Y-up, so we map
  //   plan.width  -> mesh X
  //   plan.height -> mesh Y
  //   plan.depth  -> mesh Z
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const tri of tris) {
    for (let i = 0; i < tri.positions.length; i += 3) {
      const x = tri.positions[i];
      const y = tri.positions[i + 1];
      const z = tri.positions[i + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const meshW = Math.max(maxX - minX, 1e-6);
  const meshH = Math.max(maxY - minY, 1e-6);
  const meshD = Math.max(maxZ - minZ, 1e-6);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Per-axis scale in METERS so the mesh bbox exactly matches the plan
  // bounds. Falls back to 1 (no rescale) when no target is supplied.
  const tb = options.targetBoundsMeters;
  const sxM = tb && tb.width  > 0 ? tb.width  / meshW : 1;
  const syM = tb && tb.height > 0 ? tb.height / meshH : 1;
  const szM = tb && tb.depth  > 0 ? tb.depth  / meshD : 1;

  // Build geometries
  const geometryXml: string[] = [];
  const materialXml: string[] = [];
  const effectXml: string[] = [];
  const sceneNodes: string[] = [];
  const imagesXml: string[] = [];
  const materials = (json.materials ?? []) as Array<{pbrMetallicRoughness?: {baseColorFactor?: number[]; baseColorTexture?: {index: number; texCoord?: number}}}>;
  const textures = (json.textures ?? []) as Array<{source?: number}>;

  tris.forEach((tri, i) => {
    const geomId = `geom_${i}`;
    const matId = `mat_${i}`;
    const fxId = `fx_${i}`;

    const material = tri.material === undefined ? undefined : materials[tri.material]?.pbrMetallicRoughness;
    const tex = material?.baseColorTexture;
    const imageIndex = tex ? textures[tex.index]?.source : undefined;
    const texturePath = imageIndex === undefined ? undefined : options.texturePaths?.[imageIndex];
    if (texturePath && tex?.texCoord && tex.texCoord !== 0) throw new Error("Unsupported texture coordinate set");
    // Average vertex colour → diffuse for solid-colour preview
    let avg: [number, number, number] = [0.78, 0.78, 0.78];
    if (tri.colors && tri.colors.length >= 3) {
      let r = 0, g = 0, b = 0, n = 0;
      const stride = tri.colors.length / (tri.positions.length / 3) >= 4 ? 4 : 3;
      for (let k = 0; k < tri.colors.length; k += stride) {
        r += tri.colors[k]; g += tri.colors[k + 1]; b += tri.colors[k + 2]; n++;
      }
      if (n) avg = [r / n, g / n, b / n];
    }

    if (material?.baseColorFactor) avg = material.baseColorFactor.slice(0,3) as [number,number,number];
    if (texturePath && tri.uvs) {
      imagesXml.push(`<image id="image_${i}"><init_from>${xmlEscape(texturePath)}</init_from></image>`);
      effectXml.push(`<effect id="${fxId}-effect"><profile_COMMON><newparam sid="surface_${i}"><surface type="2D"><init_from>image_${i}</init_from></surface></newparam><newparam sid="sampler_${i}"><sampler2D><source>surface_${i}</source></sampler2D></newparam><technique sid="common"><lambert><diffuse><texture texture="sampler_${i}" texcoord="UVSET0"/></diffuse></lambert></technique></profile_COMMON></effect>`);
    } else effectXml.push(`<effect id="${fxId}-effect"><profile_COMMON><technique sid="common"><lambert><diffuse><color>${fmt(avg[0])} ${fmt(avg[1])} ${fmt(avg[2])} 1</color></diffuse></lambert></technique></profile_COMMON></effect>`);
    materialXml.push(`<material id="${matId}" name="${xmlEscape(tri.name)}"><instance_effect url="#${fxId}-effect"/></material>`);

    const posCount = tri.positions.length / 3;
    // Re-centre on X/Z, drop to Y=0, then scale to plan dimensions in
    // metres, then convert to the chosen output unit (1 for metres,
    // 1/0.3048 for feet — `unit` is metres-per-output-unit, so divide).
    const posArr = new Array<string>(tri.positions.length);
    for (let i = 0; i < tri.positions.length; i += 3) {
      const xMeters = (tri.positions[i]     - cx)   * sxM;
      const yMeters = (tri.positions[i + 1] - minY) * syM;
      const zMeters = (tri.positions[i + 2] - cz)   * szM;
      posArr[i]     = fmt(xMeters / unit);
      posArr[i + 1] = fmt(yMeters / unit);
      posArr[i + 2] = fmt(zMeters / unit);
    }
    const posFloats = posArr.join(" ");
    const posSource = `<source id="${geomId}-pos"><float_array id="${geomId}-pos-array" count="${tri.positions.length}">${posFloats}</float_array><technique_common><accessor source="#${geomId}-pos-array" count="${posCount}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>`;

    let normSource = "";
    if (tri.normals) {
      const normFloats = Array.from(tri.normals, (v) => fmt(v)).join(" ");
      normSource = `<source id="${geomId}-norm"><float_array id="${geomId}-norm-array" count="${tri.normals.length}">${normFloats}</float_array><technique_common><accessor source="#${geomId}-norm-array" count="${tri.normals.length / 3}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>`;
    }

    let colorSource = "";
    if (tri.colors) {
      const stride = tri.colors.length / posCount >= 4 ? 4 : 3;
      const colFloats = Array.from(tri.colors, (v) => fmt(v)).join(" ");
      const params = stride === 4
        ? '<param name="R" type="float"/><param name="G" type="float"/><param name="B" type="float"/><param name="A" type="float"/>'
        : '<param name="R" type="float"/><param name="G" type="float"/><param name="B" type="float"/>';
      colorSource = `<source id="${geomId}-col"><float_array id="${geomId}-col-array" count="${tri.colors.length}">${colFloats}</float_array><technique_common><accessor source="#${geomId}-col-array" count="${posCount}" stride="${stride}">${params}</accessor></technique_common></source>`;
    }

    const uvSource = tri.uvs ? `<source id="${geomId}-uv"><float_array id="${geomId}-uv-array" count="${tri.uvs.length}">${Array.from(tri.uvs,(v,k)=>fmt(k%2 ? 1-v : v)).join(" ")}</float_array><technique_common><accessor source="#${geomId}-uv-array" count="${tri.uvs.length/2}" stride="2"><param name="S" type="float"/><param name="T" type="float"/></accessor></technique_common></source>` : "";
    const vertices = `<vertices id="${geomId}-vtx"><input semantic="POSITION" source="#${geomId}-pos"/></vertices>`;

    const triCount = tri.indices.length / 3;
    // Interleave indices: for each vertex of each triangle, output index for each input
    const inputs: string[] = [`<input semantic="VERTEX" source="#${geomId}-vtx" offset="0"/>`];
    let nextOffset = 1;
    if (tri.normals) {
      inputs.push(`<input semantic="NORMAL" source="#${geomId}-norm" offset="${nextOffset}"/>`);
      nextOffset++;
    }
    if (tri.colors) {
      inputs.push(`<input semantic="COLOR" source="#${geomId}-col" offset="${nextOffset}" set="0"/>`);
      nextOffset++;
    }
    if (tri.uvs) { inputs.push(`<input semantic="TEXCOORD" source="#${geomId}-uv" offset="${nextOffset}" set="0"/>`); nextOffset++; }
    const stride = nextOffset;
    const p: number[] = [];
    for (let k = 0; k < tri.indices.length; k++) {
      const vi = tri.indices[k];
      for (let s = 0; s < stride; s++) p.push(vi);
    }

    const trianglesXml = `<triangles count="${triCount}" material="${matId}-binding">${inputs.join("")}<p>${p.join(" ")}</p></triangles>`;

    geometryXml.push(`<geometry id="${geomId}" name="${xmlEscape(tri.name)}"><mesh>${posSource}${normSource}${colorSource}${uvSource}${vertices}${trianglesXml}</mesh></geometry>`);

    sceneNodes.push(`<node id="node_${i}" name="${xmlEscape(tri.name)}"><instance_geometry url="#${geomId}"><bind_material><technique_common><instance_material symbol="${matId}-binding" target="#${matId}"><bind_vertex_input semantic="UVSET0" input_semantic="TEXCOORD" input_set="0"/></instance_material></technique_common></bind_material></instance_geometry></node>`);
  });

  const created = new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset>
    <contributor><authoring_tool>FormaAI 2D→3D · GLB→DAE</authoring_tool></contributor>
    <created>${created}</created>
    <modified>${created}</modified>
    <unit name="${unitName}" meter="${unit}"/>
    <up_axis>Y_UP</up_axis>
  </asset>
  <library_images>${imagesXml.join("")}</library_images>
  <library_effects>${effectXml.join("")}</library_effects>
  <library_materials>${materialXml.join("")}</library_materials>
  <library_geometries>${geometryXml.join("")}</library_geometries>
  <library_visual_scenes>
    <visual_scene id="scene" name="scene">${sceneNodes.join("")}</visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>`;
}
/** Extract embedded images without decoding/recompressing their original pixels. */
export function glbTextureFiles(bytes: Uint8Array): { paths: Record<number,string>; files: Record<string,Uint8Array> } {
  const {json,bin}=parseGlb(bytes);
  const images=(json.images ?? []) as Array<{bufferView?:number;mimeType?:string}>;
  const views=(json.bufferViews ?? []) as BufferView[];
  const paths: Record<number,string>={}, files: Record<string,Uint8Array>={};
  images.forEach((image,i)=>{
    if(image.bufferView===undefined) throw new Error("External texture not available in GLB");
    const extension=image.mimeType==="image/png"?"png":image.mimeType==="image/jpeg"?"jpg":null;
    if(!extension) throw new Error("SketchUp texture export supports PNG and JPEG images");
    const v=views[image.bufferView];
    const name=`textures/material_${i}.${extension}`;
    paths[i]=name; files[name]=bin.slice(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
  });
  return {paths,files};
}
