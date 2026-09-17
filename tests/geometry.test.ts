import { mkdir,writeFile } from "node:fs/promises";
import { cloneForUSDZ, disposeUSDZCopy } from "../src/lib/usdz-scene.ts";
import assert from 'node:assert/strict';
import { calibratePlan } from '../src/lib/plan-calibration.ts';
import { alignPlanToInk } from '../src/lib/plan-alignment.ts';
import { trianglesToObj, trianglesToFbxAscii } from '../src/lib/mesh-export.server.ts';
import { trianglesToGlb } from '../src/lib/glb-export.server.ts';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { Box3, Vector3 } from 'three';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<0.0001,`${a} != ${b}`);
near(calibratePlan([0,0],[.5,0],2000,1000,10,'meters').planWidthMeters,20);
near(calibratePlan([0,0],[0,.5],2000,1000,10,'feet').planWidthMeters,12.192);
assert.throws(()=>calibratePlan([.1,.1],[.1,.1],2000,1000,10,'feet'));
assert.throws(()=>calibratePlan([0,0],[.5,0],2000,1000,NaN,'meters'));
const walls=[{id:'wall1',type:'wall',points:[[.1,.1],[.8,.1],[.8,.13],[.1,.13]] as [number,number][]},{id:'man_1',type:'wall',points:[[.2,.2],[.2,.6],[.22,.6],[.22,.2]] as [number,number][]}];
assert.equal(alignPlanToInk(walls,new Uint8Array(40000),200,200).changed,false);
const ink=new Uint8Array(40000);for(let y=28;y<34;y++)for(let x=20;x<160;x++)ink[y*200+x]=255;
const aligned=alignPlanToInk(walls,ink,200,200);assert.ok(aligned.changed);assert.deepEqual(aligned.polygons[1],walls[1]);
const indices=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
function box(name:string,x:number,y:number,z:number,w:number,d:number,h:number){return {id:name,name,positions:[x,y,z,x+w,y,z,x+w,y+d,z,x,y+d,z,x,y,z+h,x+w,y,z+h,x+w,y+d,z+h,x,y+d,z+h],indices,materialId:'concrete_smooth' as const,parentPath:[z>=3?'Upper floor':'Ground floor'],color:[.7,.6,.5] as [number,number,number]};}
// Synthetic two-floor fixture: divided rooms, doorway gap + lintel and stairs.
const groups=[box('slab',0,0,0,12,8,.2),box('north',0,7.8,.2,12,.2,2.8),box('west',0,0,.2,.2,8,2.8),box('door_left',5,0,.2,.2,3,2.8),box('door_right',5,4,.2,.2,4,2.8),box('lintel',5,3,2.3,.2,1,.7),box('upper_slab',0,0,3,12,8,.2)];
for(let i=0;i<12;i++)groups.push(box(`step_${i}`,9,i*.25,.2,1,.25,(i+1)*.23));
for(const units of ['meters','feet'] as const){
 const scaled=groups.map(g=>({...g,positions:g.positions.map(v=>units==='feet'?v/.3048:v)}));
 const glb=trianglesToGlb(scaled,units);
 const result=await new GLTFLoader().parseAsync(glb.buffer,'');
 const bounds=new Box3().setFromObject(result.scene).getSize(new Vector3());near(bounds.x,12);near(bounds.y,3.2);near(bounds.z,8);
 let meshes=0;result.scene.traverse((obj:any)=>{if(obj.isMesh){meshes++;assert.equal(obj.geometry.index.count,36);}});assert.equal(meshes,groups.length);
 const exportCopy=cloneForUSDZ(result.scene);
 const usdz=await new USDZExporter().parseAsync(exportCopy);disposeUSDZCopy(exportCopy);
 if(process.env.WRITE_USDZ_FIXTURE && units==="meters"){await mkdir("../outputs",{recursive:true});await writeFile("../outputs/formai-two-floor-qa.usdz",new Uint8Array(usdz));}
 const archive=unzipSync(new Uint8Array(usdz));
 assert.ok(Object.keys(archive).some(name=>name.endsWith(".usda")));
 const usdText=Object.entries(archive).filter(([name])=>name.endsWith(".usda")).map(([,bytes])=>strFromU8(bytes)).join("\n");
 assert.match(usdText,/metersPerUnit = 1/);assert.match(usdText,/upAxis = "Y"/);assert.ok((usdText.match(/def Mesh/g)||[]).length===groups.length);
 const {obj,mtl}=trianglesToObj(scaled);assert.equal((mtl.match(/^newmtl /gm)||[]).length,groups.length);assert.equal(new OBJLoader().parse(obj).children.length,groups.length);
 const fbx=trianglesToFbxAscii(scaled,units,'Z');
 const scene=new FBXLoader().parse(new TextEncoder().encode(fbx).buffer,'');assert.equal(scene.children.length,groups.length);
 assert.match(fbx,new RegExp(`UnitScaleFactor[^\\n]+,${units==='feet'?'30.48':'100'}`));
}
console.log('PASS: scale calibration, conservative alignment, manual outline preservation, two-floor GLB dimensions in meters/feet, OBJ/MTL groups, FBX parse and unit metadata. USDZ archive and mesh structure. Synthetic fixture only; native Quick Look and real plan analysis not covered.');
