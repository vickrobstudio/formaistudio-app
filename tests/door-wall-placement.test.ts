import assert from "node:assert/strict";
import {placeDoorsInWalls} from "../src/lib/door-wall-placement.ts";
const rectangle=(x:number,y:number,w:number,d:number):[number,number][]=>[[x,y],[x+w,y],[x+w,y+d],[x,y+d]];
const wall={id:"wall",type:"wall",points:rectangle(0,-.1,6,.2)};
const door={id:"door",type:"door",points:rectangle(2,.08,1,.08)};
const result=placeDoorsInWalls([wall,door],2.6);
const aligned=result.doors.get("door")!;
assert.ok(Math.abs(aligned.reduce((sum,p)=>sum+p[1],0))<1e-8);
assert.equal(result.pieces.get("wall")!.length,3);
for(const piece of result.pieces.get("wall")!){
 const xs=piece.points.map(p=>p[0]);
 if(piece.base===0)assert.ok(Math.max(...xs)<=2 || Math.min(...xs)>=3,"No wall fills doorway below head height");
 else {assert.equal(piece.base,2.1);assert.ok(Math.abs(piece.height-.5)<1e-8);}
}
const gap=placeDoorsInWalls([{...wall,points:rectangle(0,-.1,2,.2)},{...wall,id:"right",points:rectangle(3,-.1,3,.2)},door],2.6);
assert.equal(gap.lintels.length,1);assert.equal(gap.lintels[0].base,2.1);
assert.throws(()=>placeDoorsInWalls([wall,{...door,points:rectangle(2,2,1,.1)}],2.6),/not on/);
assert.throws(()=>placeDoorsInWalls([wall,door],2),/ceiling/);
const rotate=(points:[number,number][])=>points.map(([x,y])=>[(x-y)/Math.sqrt(2),(x+y)/Math.sqrt(2)] as [number,number]);
const rotated=placeDoorsInWalls([{...wall,points:rotate(wall.points)},{...door,points:rotate(door.points)}],2.6);
assert.equal(rotated.pieces.get("wall")!.length,3);
console.log("Door alignment, full-depth opening, lintel, gap and rotated-wall tests passed");

