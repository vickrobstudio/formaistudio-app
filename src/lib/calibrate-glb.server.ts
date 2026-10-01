/** Bake physical dimensions into GLB vertex data without changing textures or UVs. */
export function calibrateGlb(source: Uint8Array, target: { width: number; depth?: number; height?: number }): Uint8Array {
  if (![target.width, target.depth ?? target.width, target.height ?? target.width].every(v => Number.isFinite(v) && v > 0 && v <= 1000)) throw new Error("Enter positive dimensions in meters.");
  const header = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2) throw new Error("Invalid GLB");
  const jsonLength = header.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(source.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const bin = source.slice(binStart);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  // This reconstruction pipeline uses untransformed static meshes. Fail closed
  // rather than silently scaling the wrong coordinate space for another asset.
  const identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
  const used = new Set<number>();
  for (const node of doc.nodes ?? []) {
    if ((node.matrix && node.matrix.some((v: number,i: number) => Math.abs(v-identity[i]) > 1e-8)) ||
        (node.translation && node.translation.some((v: number) => v !== 0)) ||
        (node.scale && node.scale.some((v: number) => v !== 1)) ||
        (node.rotation && node.rotation.some((v: number,i: number) => v !== (i === 3 ? 1 : 0)))) throw new Error("This model has transformed nodes and requires coordinate normalization before calibration.");
    if (node.mesh !== undefined) { if (used.has(node.mesh)) throw new Error("Instanced geometry requires normalization before calibration."); used.add(node.mesh); }
  }
  const positions = new Set<number>(), normals = new Set<number>();
  for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.targets || primitive.extensions?.KHR_draco_mesh_compression) throw new Error("Unsupported compressed or animated geometry");
    if (primitive.attributes.POSITION !== undefined) positions.add(primitive.attributes.POSITION);
    if (primitive.attributes.NORMAL !== undefined) normals.add(primitive.attributes.NORMAL);
  }
  function each(id: number, fn: (v: number[]) => number[] | void) {
    const a = doc.accessors[id], b = doc.bufferViews[a.bufferView];
    if (a.componentType !== 5126 || a.type !== "VEC3" || a.sparse || (b.buffer ?? 0) !== 0) throw new Error("Unsupported geometry accessor");
    const base = (b.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = b.byteStride ?? 12;
    for (let i=0;i<a.count;i++) {
      const offset=base+i*stride, v=[0,1,2].map(j=>view.getFloat32(offset+j*4,true));
      const next=fn(v); if(next) next.forEach((n,j)=>view.setFloat32(offset+j*4,n,true));
    }
  }
  const lo=[Infinity,Infinity,Infinity], hi=[-Infinity,-Infinity,-Infinity];
  for(const id of positions) each(id,v=>{v.forEach((n,j)=>{lo[j]=Math.min(lo[j],n);hi[j]=Math.max(hi[j],n);});});
  const size=hi.map((v,j)=>v-lo[j]);
  if(size.some(v=>!Number.isFinite(v)||v<=0)) throw new Error("Cannot calibrate empty or flat geometry");
  const uniform=target.width/size[0];
  const scales=[uniform, target.height ? target.height/size[1] : uniform, target.depth ? target.depth/size[2] : uniform];
  const origin=[(lo[0]+hi[0])/2,lo[1],(lo[2]+hi[2])/2];
  for(const id of positions) {
    each(id,v=>v.map((n,j)=>(n-origin[j])*scales[j]));
    doc.accessors[id].min=lo.map((n,j)=>(n-origin[j])*scales[j]);
    doc.accessors[id].max=hi.map((n,j)=>(n-origin[j])*scales[j]);
  }
  for(const id of normals) each(id,v=>{const n=v.map((x,j)=>x/scales[j]); const length=Math.hypot(...n)||1; return n.map(x=>x/length);});
  // Tangent frames would also require an inverse scale; omit so renderers derive
  // them from the unchanged UVs instead of using stale tangent directions.
  for(const mesh of doc.meshes ?? []) for(const primitive of mesh.primitives) delete primitive.attributes.TANGENT;
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const padded=(json.length+3)&~3, out=new Uint8Array(20+padded+8+bin.length), dv=new DataView(out.buffer);
  dv.setUint32(0,0x46546c67,true); dv.setUint32(4,2,true); dv.setUint32(8,out.length,true);
  dv.setUint32(12,padded,true); dv.setUint32(16,0x4e4f534a,true); out.fill(32,20,20+padded); out.set(json,20);
  dv.setUint32(20+padded,bin.length,true); dv.setUint32(24+padded,0x004e4942,true); out.set(bin,28+padded);
  return out;
}
