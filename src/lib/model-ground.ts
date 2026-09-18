type GroundGroup = { id: string; name: string; positions: number[]; indices: number[]; materialId: string; parentPath?: string[] };

/** Z-up export geometry: preserve relative heights, rest the assembly on a solid ground slab. */
export function groundExportGroups<T extends GroundGroup>(groups: T[], units: "meters" | "feet"): void {
  if (!groups.length || groups.some(g=>g.id === "formai_ground_floor")) return;
  let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const g of groups) for(let i=0;i<g.positions.length;i+=3){
    const [x,y,z]=g.positions.slice(i,i+3);
    if (![x,y,z].every(Number.isFinite)) throw new Error("Model contains invalid coordinates.");
    x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);z0=Math.min(z0,z);
  }
  if (!Number.isFinite(z0)) return;
  const thickness=.02*(units === "feet" ? 1/.3048 : 1);
  for(const g of groups) for(let i=2;i<g.positions.length;i+=3) g.positions[i]+=thickness-z0;
  groups.push({id:"formai_ground_floor",name:"Ground floor",parentPath:["LAYER_SLABS_FLOOR_CEILING"],materialId:"concrete_polished",
    positions:[x0,y0,0,x1,y0,0,x1,y1,0,x0,y1,0,x0,y0,thickness,x1,y0,thickness,x1,y1,thickness,x0,y1,thickness],
    indices:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]} as T);
}

