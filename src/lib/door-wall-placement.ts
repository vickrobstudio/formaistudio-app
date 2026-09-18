type Point = [number, number];
type Polygon = { id: string; type: string; points: Point[] };
export type WallPiece = { points: Point[]; base: number; height: number };
type Frame = { center: Point; u: Point; v: Point; length: number; thickness: number };
const dot = (a: Point, b: Point) => a[0]*b[0]+a[1]*b[1];
const delta = (a: Point,b: Point): Point => [a[0]-b[0],a[1]-b[1]];

function frame(points: Point[]): Frame | null {
  const p = points.length === 5 && points[0][0] === points[4][0] && points[0][1] === points[4][1] ? points.slice(0,4) : points;
  if(p.length!==4) return null;
  const edges=p.map((a,i)=>delta(p[(i+1)%4],a));
  const lengths=edges.map(e=>Math.hypot(...e));
  if(lengths.some(n=>!Number.isFinite(n)||n<.001)) return null;
  for(let i=0;i<4;i++) if(Math.abs(dot(edges[i],edges[(i+1)%4])/(lengths[i]*lengths[(i+1)%4]))>.02) return null;
  const k=lengths.indexOf(Math.max(...lengths));
  const u:Point=[edges[k][0]/lengths[k],edges[k][1]/lengths[k]];
  return {center:[p.reduce((s,a)=>s+a[0],0)/4,p.reduce((s,a)=>s+a[1],0)/4],u,v:[-u[1],u[0]],length:lengths[k],thickness:lengths[(k+1)%4]};
}
function rect(f:Frame,start:number,end:number,thickness=f.thickness):Point[]{
  return [[start,-thickness/2],[end,-thickness/2],[end,thickness/2],[start,thickness/2]].map(([x,y])=>[f.center[0]+f.u[0]*x+f.v[0]*y,f.center[1]+f.u[1]*x+f.v[1]*y]);
}

/** Work in meters. Align nearby rectangular wall runs; ambiguous openings stop the build. */
export function placeDoorsInWalls(polygons: Polygon[], wallHeight:number, doorHeight=2.1) {
  const walls=polygons.filter(p=>p.type==="wall").map(p=>({p,f:frame(p.points)}));
  const doors=new Map<string,Point[]>();
  const openings: {f:Frame;start:number;end:number;base:number;top:number}[]=[];
  for(const door of polygons.filter(p=>p.type==="door" || p.type==="window")){
    const base=door.type==="window" ? .9 : 0;
    const top=door.type==="window" ? 2.1 : doorHeight;
    if(wallHeight<=top) throw new Error("The ceiling must be above the door or window head. Correct the height before building.");
    const center:Point=[door.points.reduce((s,p)=>s+p[0],0)/door.points.length,door.points.reduce((s,p)=>s+p[1],0)/door.points.length];
    const candidates=walls.flatMap(({f})=>{
      if(!f) return [];
      const projected=door.points.map(p=>dot(delta(p,f.center),f.u));
      const width=Math.max(...projected)-Math.min(...projected);
      const along=dot(delta(center,f.center),f.u), distance=Math.abs(dot(delta(center,f.center),f.v));
      const gap=Math.max(0,Math.abs(along)-f.length/2);
      if(width<.3||width>3||distance>Math.max(.35,f.thickness)||gap>width/2+.1) return [];
      return [{f,start:along-width/2,end:along+width/2,score:distance+gap*.1}];
    }).sort((a,b)=>a.score-b.score);
    const host=candidates[0];
    if(!host) throw new Error(`${door.type} ${door.id} is not on a supported wall run. In the 2D review, draw its width over the wall opening, not over a swing arc or a note.`);
    if(candidates.slice(1).some(c=>Math.abs(c.score-host.score)<.05 && Math.abs(dot(c.f.u,host.f.u))<.95)) throw new Error(`${door.type} ${door.id} is ambiguous at a wall corner. Correct its 2D position before building.`);
    if(openings.some(o=>Math.abs(dot(o.f.u,host.f.u))>.999 && Math.abs(dot(delta(host.f.center,o.f.center),o.f.v))<.05 && (()=>{const c=dot(delta(host.f.center,o.f.center),o.f.u);const sign=dot(host.f.u,o.f.u);const ends=[c+host.start*sign,c+host.end*sign];return Math.min(o.end,Math.max(...ends))-Math.max(o.start,Math.min(...ends))>.01;})())) throw new Error("Door and window outlines overlap. Separate their widths in the 2D review.");
    doors.set(door.id,rect(host.f,host.start,host.end,Math.min(.04,host.f.thickness)));
    openings.push({...host,base,top});
  }
  const pieces=new Map<string,WallPiece[]>();
  for(const {p,f} of walls){
    if(!f) {
      // Irregular outlines are safe only when no door is being placed in them.
      if(openings.length) throw new Error("For door and window openings, split irregular wall outlines into rectangular wall runs in the 2D review.");
      continue;
    }
    const cuts=openings.flatMap(o=>{
      if(Math.abs(dot(f.u,o.f.u))<.999 || Math.abs(dot(delta(o.f.center,f.center),f.v))>(f.thickness+o.f.thickness)/2+.01) return [];
      const ends=[o.start,o.end].map(t=>dot(delta([o.f.center[0]+o.f.u[0]*t,o.f.center[1]+o.f.u[1]*t],f.center),f.u));
      const start=Math.max(-f.length/2,Math.min(...ends)),end=Math.min(f.length/2,Math.max(...ends));
      return end-start>.001 ? [{start,end,base:o.base,top:o.top}] : [];
    }).sort((a,b)=>a.start-b.start);
    if(!cuts.length) continue;
    const levels=[...new Set([0,wallHeight,...cuts.flatMap(c=>[c.base,c.top])])].sort((a,b)=>a-b);
    const result:WallPiece[]=[];
    for(let i=0;i<levels.length-1;i++){
      const base=levels[i],top=levels[i+1];
      const active=cuts.filter(c=>c.base<top && c.top>base);
      let cursor=-f.length/2;
      for(const cut of active){
        if(cut.start-cursor>.001)result.push({points:rect(f,cursor,cut.start),base,height:top-base});
        cursor=Math.max(cursor,cut.end);
      }
      if(f.length/2-cursor>.001)result.push({points:rect(f,cursor,f.length/2),base,height:top-base});
    }
    pieces.set(p.id,result);
  }
  const lintels:WallPiece[]=[];
  for(const o of openings){
    const coverage=walls.flatMap(({f})=>{
      if(!f || Math.abs(dot(f.u,o.f.u))<.999 || Math.abs(dot(delta(f.center,o.f.center),o.f.v))>.01)return [];
      const middle=dot(delta(f.center,o.f.center),o.f.u);
      return [{start:Math.max(o.start,middle-f.length/2),end:Math.min(o.end,middle+f.length/2)}];
    }).filter(c=>c.end>c.start).sort((a,b)=>a.start-b.start);
    if(!coverage.length || coverage[0].start>o.start+.02 || Math.max(...coverage.map(c=>c.end))<o.end-.02) {
      // A gap is valid only between actual wall jambs; do not extend a facade to chase a misplaced opening.
      const supported=walls.filter(({f})=>f && Math.abs(dot(f.u,o.f.u))>.999 && Math.abs(dot(delta(f.center,o.f.center),o.f.v))<.01).map(({f})=>({start:dot(delta(f!.center,o.f.center),o.f.u)-f!.length/2,end:dot(delta(f!.center,o.f.center),o.f.u)+f!.length/2}));
      if(!supported.some(c=>c.start<=o.start+.02 && c.end>=o.start-.02) || !supported.some(c=>c.start<=o.end+.02 && c.end>=o.end-.02)) throw new Error("An opening extends beyond its wall. Align both jambs in the 2D review.");
    }
    let cursor=o.start;
    const fillGap=(start:number,end:number)=>{
      lintels.push({points:rect(o.f,start,end),base:o.top,height:wallHeight-o.top});
      if(o.base>0)lintels.push({points:rect(o.f,start,end),base:0,height:o.base});
    };
    for(const c of coverage){if(c.start-cursor>.001)fillGap(cursor,c.start);cursor=Math.max(cursor,c.end);}
    if(o.end-cursor>.001)fillGap(cursor,o.end);
  }
  return {doors,pieces,lintels};
}

