/** Parse a complete dimension, never a numeric prefix of an invalid label. */
export function parseArchitecturalMeasurement(input: string, defaultUnit: "meters" | "feet" = "meters"): number {
  const text = input.trim().toLowerCase().replace(/[′’]/g, "'").replace(/[″“”]/g, '"');
  const number = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
  function amount(raw: string): number {
    const mixed = raw.trim().match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[3]) > 0 ? Number(mixed[1] || 0) + Number(mixed[2]) / Number(mixed[3]) : NaN;
    return new RegExp(`^${number}$`).test(raw.trim()) ? Number(raw) : NaN;
  }
  let meters = NaN;
  const metric = text.match(new RegExp(`^(${number})\\s*(mm|cm|m|meters?|metres?)$`));
  const feet = text.match(new RegExp(`^(${number})\\s*(?:'|ft|feet)\\s*(?:-?\\s*(.*?)\\s*(?:"|in|inches?))?$`));
  const inches = text.match(/^(.*?)\s*(?:"|in|inches?)$/);
  if (metric) meters = Number(metric[1]) * (metric[2] === "mm" ? .001 : metric[2] === "cm" ? .01 : 1);
  else if (feet) {
    const inch = feet[2] === undefined ? 0 : amount(feet[2]);
    if (inch >= 0 && inch < 12) meters = Number(feet[1]) * .3048 + inch * .0254;
  } else if (inches) meters = amount(inches[1]) * .0254;
  else meters = amount(text) * (defaultUnit === "feet" ? .3048 : 1);
  if (!Number.isFinite(meters) || meters <= 0) throw new Error('Enter a positive dimension such as 2.50 m, 600 mm, 36" or 12\'-6".');
  return meters;
}

/** Reject invalid loops and normalize winding before solid extrusion. */
export function cleanPlanPolygon(points: Array<[number, number]>): Array<[number, number]> {
  const p = points.filter((v, i) => !i || v[0] !== points[i - 1][0] || v[1] !== points[i - 1][1]).map(v => [...v] as [number, number]);
  if (p.length > 1 && p[0][0] === p.at(-1)![0] && p[0][1] === p.at(-1)![1]) p.pop();
  if (p.length < 3 || p.some(v => v.some(n => !Number.isFinite(n)))) throw new Error("Invalid polygon: redraw its boundary.");
  const cross = (a: number[], b: number[], c: number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const on = (a: number[], b: number[], c: number[]) => Math.abs(cross(a,b,c)) < 1e-10 && c[0] >= Math.min(a[0],b[0]) && c[0] <= Math.max(a[0],b[0]) && c[1] >= Math.min(a[1],b[1]) && c[1] <= Math.max(a[1],b[1]);
  for (let i=0;i<p.length;i++) for(let j=i+1;j<p.length;j++) {
    if(j===i+1 || (i===0 && j===p.length-1)) continue;
    const a=p[i], b=p[(i+1)%p.length], c=p[j], d=p[(j+1)%p.length];
    if ((cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b)) throw new Error("A boundary crosses itself. Correct the 2D outline before building.");
  }
  const area = p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0);
  if (Math.abs(area)<1e-10) throw new Error("A boundary has no area. Correct the 2D outline.");
  return area < 0 ? p.reverse() : p;
}

