import assert from "node:assert/strict";
import {groundExportGroups} from "../src/lib/model-ground.ts";
for(const unit of ["meters","feet"] as const){
 const groups=[{id:"building",name:"Building",materialId:"concrete_polished",positions:[0,0,-3,2,0,1,2,2,1,0,2,-3],indices:[]}];
 groundExportGroups(groups,unit);
 const thickness=.02*(unit==="feet"?1/.3048:1);
 assert.ok(Math.abs(groups[0].positions[2]-thickness)<1e-9);
 assert.ok(Math.abs(groups[0].positions[5]-groups[0].positions[2]-4)<1e-9);
 assert.equal(groups[1].positions[2],0); assert.equal(groups[1].positions[14],thickness);
 const original=JSON.stringify(groups);groundExportGroups(groups,unit);assert.equal(JSON.stringify(groups),original);
}
console.log("Export grounding preserves relative heights, adds ground, and is idempotent");

