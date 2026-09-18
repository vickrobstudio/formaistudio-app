import assert from "node:assert/strict";
import { parseArchitecturalMeasurement as parse, cleanPlanPolygon } from "../src/lib/architectural-measurement.ts";
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
near(parse("2.50"),2.5); near(parse("150 cm"),1.5); near(parse("600 mm"),.6);
near(parse("12'-6\""),3.81); near(parse("4' 8 1/2\""),1.4351);
near(parse('36"'),.9144); near(parse('0.75"'),.01905); near(parse("12.5'"),3.81);
near(parse("8′ 6″"),2.5908); near(parse("10","feet"),3.048);
for(const bad of ["", "0", "-3 m", "1/0", "12 feet garbage", "1:50", "12' 14\"", "NaN", "2 m extra"]){assert.throws(()=>parse(bad),bad);}
const square: [number,number][]=[[0,0],[2,0],[2,1],[0,1]];
assert.deepEqual(cleanPlanPolygon(square),square);
assert.deepEqual(cleanPlanPolygon([...square].reverse()).length,4);
assert.equal(cleanPlanPolygon([...square,[0,0]]).length,4);
assert.throws(()=>cleanPlanPolygon([[0,0],[2,2],[0,2],[2,0]]));
assert.throws(()=>cleanPlanPolygon([[0,0],[1,0],[2,0]]));
console.log("Architectural dimensions and boundary validation passed");

