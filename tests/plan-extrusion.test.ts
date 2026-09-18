import assert from "node:assert/strict";
import { extrudePolygonIntoGroup } from "../src/lib/plan-extrusion.ts";
for (const outline of [ [[0,0],[2,0],[2,1],[0,1]], [[0,1],[2,1],[2,0],[0,0]] ]) {
  const mesh = { positions: [] as number[], indices: [] as number[] };
  extrudePolygonIntoGroup(mesh, outline as [number,number][], 0, 2.6, 1);
  const edges=new Map<string,number>(); let volume=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const ids=mesh.indices.slice(i,i+3), [a,b,c]=ids.map(id=>mesh.positions.slice(id*3,id*3+3));
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for(let j=0;j<3;j++){const key=[ids[j],ids[(j+1)%3]].sort((x,y)=>x-y).join(':');edges.set(key,(edges.get(key)||0)+1);}
  }
  assert.ok(Math.abs(volume-5.2)<1e-8,`Outward winding and volume: ${volume}`);
  assert.ok([...edges.values()].every(n=>n===2),"Every edge belongs to two faces");
}
console.log("Both polygon windings produce closed outward-facing solids");

