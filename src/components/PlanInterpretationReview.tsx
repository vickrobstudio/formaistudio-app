import { cleanPlanPolygon } from "@/lib/architectural-measurement";

type Floor = { label: string; heightMeters: number; planWidthMetersOverride?: number; recognition?: { reviewed?: boolean; imageWidth: number; imageHeight: number; planWidthMeters: number; polygons: { type: string; points: [number, number][] }[] } };

export function PlanInterpretationReview({ floors, approved, onApprove }: { floors: Floor[]; approved: boolean; onApprove: (value: boolean) => void }) {
  let invalid = false;
  const reports = floors.map((floor, index) => {
    const r = floor.recognition;
    const scale = r ? (floor.planWidthMetersOverride ?? r.planWidthMeters) / Math.max(r.imageWidth, r.imageHeight) : 0;
    const counts: Record<string, number> = {};
    let area = 0;
    const warnings: string[] = [];
    if (!r?.reviewed) warnings.push("Review the selected 2D parts and calibrate a known dimension.");
    if (!(scale > 0) || !Number.isFinite(scale)) warnings.push("A measured scale is required.");
    if (!(floor.heightMeters >= .3 && floor.heightMeters <= 15)) warnings.push("Enter a ceiling height between 0.3 and 15 meters.");
    for (const poly of r?.polygons ?? []) {
      counts[poly.type] = (counts[poly.type] ?? 0) + 1;
      try {
        const points = cleanPlanPolygon(poly.points);
        if (poly.type === "floor") area += Math.abs(points.reduce((sum,a,i)=>{ const b=points[(i+1)%points.length];return sum+a[0]*b[1]-b[0]*a[1]; },0)) / 2 * r!.imageWidth * r!.imageHeight * scale ** 2;
      } catch (error) { warnings.push(error instanceof Error ? error.message : "Invalid boundary."); }
    }
    if (!Object.keys(counts).length) warnings.push("No selected parts.");
    invalid ||= warnings.length > 0;
    return <div key={index} className="space-y-1 border-t py-3 text-sm">
      <h3 className="font-semibold">{floor.label || `Floor ${index + 1}`}</h3>
      <p>Measured scale: {r?.reviewed && scale > 0 ? `${scale.toFixed(6)} m / pixel` : "Not confirmed"}. Ceiling: {floor.heightMeters} m.</p>
      <p>{Object.entries(counts).map(([type,count]) => `${type}: ${count}`).join(" · ") || "Awaiting interpretation"}</p>
      {area > 0 && <p>Selected floor area: {area.toFixed(2)} m² (overlapping regions count separately).</p>}
      {warnings.map((warning,i)=><p key={i} role="alert" className="text-destructive">{warning}</p>)}
    </div>;
  });
  return <section aria-label="Plan interpretation report" className="mt-5 rounded-xl border p-4">
    <h2 className="font-bold">Plan interpretation · Build 70</h2>
    <p className="my-2 text-xs text-muted-foreground">Check the outlines against the drawing. Use written dimensions for calibration. A printed scale ratio alone is insufficient on a resized image. N.P.T. is floor elevation, not ceiling height.</p>
    {reports}
    <p className="mb-3 text-xs text-muted-foreground">Assumed unless edited: ceiling 2.60 m; doors 2.10 m; windows 1.20 m high at 0.90 m; cabinets 0.90 m high. Verify openings, wall intersections and fixed furniture in the 3D preview. This reconstruction is not a certified construction model.</p>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved && !invalid} disabled={invalid} onChange={e=>onApprove(e.target.checked)} />I reviewed the parts, measured scale and heights. Build this interpretation.</label>
  </section>;
}


