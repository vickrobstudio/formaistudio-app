import assert from "node:assert/strict";
import {executeMeteredOperation} from "../src/lib/metered-operation.ts";
let calls=0;let completed:string[]=[];
for(const status of ["insufficient_credits","subscription_required","daily_limit","rate_limit","busy","reserved","completed","uncertain","refunded"]){
 await assert.rejects(()=>executeMeteredOperation(async()=>status,async(s)=>{completed.push(s)},async()=>{calls++;return new Response("ok")}));
}assert.equal(calls,0);assert.deepEqual(completed,[]);
await assert.rejects(()=>executeMeteredOperation(async()=>{throw Error("database unavailable")},async()=>{},async()=>{calls++;return new Response("ok")}));assert.equal(calls,0);
for(const [code,expected] of [[200,"completed"],[400,"refunded"],[429,"refunded"],[502,"uncertain"],[504,"uncertain"]] as const){
 completed=[];await executeMeteredOperation(async()=>"accepted",async(s)=>{completed.push(s)},async()=>{calls++;return new Response("result",{status:code})});assert.deepEqual(completed,[expected]);
}assert.equal(calls,5);
completed=[];await assert.rejects(()=>executeMeteredOperation(async()=>"accepted",async(s)=>{completed.push(s)},async()=>{calls++;throw Error("connection lost")}));assert.equal(calls,6);assert.deepEqual(completed,["uncertain"]);
console.log("PASS: no upstream calls without reservation; no duplicate invocations; rejected calls refunded; ambiguous timeouts held without retries.");
