import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { MATERIAL_PALETTE, LAYER_NAMES } from '../src/lib/floor-3d-shared.ts';
import { groundExportGroups } from '../src/lib/model-ground.ts';
import { extrudePolygonIntoGroup } from '../src/lib/plan-extrusion.ts';
import { placeDoorsInWalls } from '../src/lib/door-wall-placement.ts';
import { parseDaeToTriangles } from '../src/lib/dae-to-triangles.server.ts';
import { trianglesToFbxAscii } from '../src/lib/mesh-export.server.ts';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Execute the production geometry functions without starting a server or spending AI credits.
const source = readFileSync(new URL('../src/lib/floor-3d.functions.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('floor.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['makeGroupBuilder', 'escapeXml', 'emitDaeFromGroups']);
const declarations = ast.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name?.text ?? '')).map(n => n.getText(ast)).join('\n');
const specs = ast.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(ast) === 'MARK_LIFT_SPECS'))!.getText(ast).replace('export ', '');
const handlerStart = source.indexOf('    const outputScale', source.indexOf('export const liftAnnotatedFloor'));
const handlerEnd = source.indexOf('    if (groups.length === 0)', handlerStart);
const code = `${declarations}\n${specs}\nfunction build(data) { ${source.slice(handlerStart,handlerEnd)} return groups; }\nreturn { build, emitDaeFromGroups };`;
const compiled = ts.transpile(code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
const api = new Function('MATERIAL_PALETTE','LAYER_NAMES','groundExportGroups','extrudePolygonIntoGroup','placeDoorsInWalls',compiled)(MATERIAL_PALETTE,LAYER_NAMES,groundExportGroups,extrudePolygonIntoGroup,placeDoorsInWalls);
const rect = (x:number,y:number,w:number,h:number) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
for (const outputUnits of ['meters','feet']) {
  const groups=api.build({label:'Test floor',imageWidth:1000,imageHeight:1000,planWidthMeters:10,outputUnits,wallHeightMeters:2.6,polygons:[
    {id:'wood1',type:'cabinet',points:rect(.1,.2,.1,.06),material:'wood_oak'},
    {id:'wood2',type:'cabinet',points:rect(.3,.2,.1,.06),material:'wood_oak'},
    {id:'stone',type:'cabinet',points:rect(.5,.2,.1,.06),material:'stone_marble_carrara'},
    {id:'unknown',type:'column',points:rect(.7,.2,.04,.04)},
  ]});
  assert.equal(groups.length,4,'Separate pieces must not merge even with identical materials');
  assert.equal(groups[3].materialId,'other','Missing material must remain unspecified');
  assert.equal(groups[0].parentPath[2],MATERIAL_PALETTE.wood_oak.label);
  const dae=api.emitDaeFromGroups(groups,outputUnits);
  const parsed=parseDaeToTriangles(dae);
  assert.equal(parsed.length,5,'Four parts plus ground');
  assert.equal(new Set(parsed.map(g=>g.name)).size,5);
  assert.ok(dae.includes('10_MILLWORK_AND_BUILT_INS'));
  assert.ok(dae.includes('Unspecified material'));
  assert.notDeepEqual(parsed[0].color,parsed[2].color,'Material colors survive DAE parsing');
  const fbx=trianglesToFbxAscii(parsed,outputUnits,'Z');
  const scene=new FBXLoader().parse(new TextEncoder().encode(fbx).buffer,'');
  const meshes:any[]=[];scene.traverse((o:any)=>{if(o.isMesh)meshes.push(o);});
  assert.equal(meshes.length,5,'FBX import exposes each editable part');
  assert.equal(new Set(meshes.map(m=>m.name)).size,5);
  assert.notDeepEqual(meshes[0].material.color.toArray(),meshes[2].material.color.toArray());
  const before=meshes[1].position.clone();meshes[0].position.x+=1;
  assert.deepEqual(meshes[1].position,before,'Editing one object does not move another');
}
console.log('Material-separated DAE and FBX round-trip, independent editing and unknown material tests passed');

// Furniture uses the same editable geometry route as the downloaded model.
const geometryFunctions = ast.statements.filter(n => ts.isFunctionDeclaration(n)).map(n => n.getText(ast).replace(/^export /, "")).join("\n");
const furnitureCode = ts.transpile(geometryFunctions + "\nreturn { buildDae };", { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
const furnitureApi = new Function('MATERIAL_PALETTE', 'LAYER_NAMES', 'groundExportGroups', furnitureCode)(MATERIAL_PALETTE, LAYER_NAMES, groundExportGroups);
for (const units of ['meters', 'feet']) {
  const part = { shape: 'box', cx: 0, cy: 0, cz: .35, width: .1, depth: .1, height: .7, rotationDegZ: 0, material: 'wood_oak' };
  const model = { kind: 'furniture', parts: [
    { ...part, name: 'Left leg', cx: -.4 },
    { ...part, name: 'Right leg', cx: .4 },
    { ...part, name: 'Marble top', material: 'stone_marble_carrara', cz: .725, width: 1, depth: .6, height: .05 },
  ] };
  const { dae, groups } = furnitureApi.buildDae(model, 2.6, units);
  const parsed = parseDaeToTriangles(dae);
  assert.equal(groups.length, 4, 'Three furniture parts and a separate ground plane');
  assert.equal(parsed.length, 4);
  assert.ok(dae.includes('Furniture'));
  assert.notEqual(parsed[0].name, parsed[1].name, 'Legs with the same material stay separate');
  assert.notDeepEqual(parsed[0].color, parsed[2].color);
  const scene = new FBXLoader().parse(new TextEncoder().encode(trianglesToFbxAscii(parsed, units, 'Z')).buffer, '');
  const meshes: any[] = []; scene.traverse((o:any) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 4);
}
console.log('Furniture part separation, material assignment and ground plane export passed');
