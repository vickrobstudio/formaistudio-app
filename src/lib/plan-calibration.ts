export type PlanPoint = [number, number];

/** Normalized coordinates refer to the full original image, including margins. */
export function calibratePlan(a: PlanPoint, b: PlanPoint, width: number, height: number, distance: number, units: "meters" | "feet") {
  if (![width, height, distance].every((v) => Number.isFinite(v) && v > 0) ||
      ![...a, ...b].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
    throw new Error("Choose two points and enter a positive known distance.");
  }
  const pixels = Math.hypot((b[0] - a[0]) * width, (b[1] - a[1]) * height);
  if (pixels < 2) throw new Error("Choose points farther apart for an accurate measurement.");
  const metersPerPixel = distance * (units === "feet" ? 0.3048 : 1) / pixels;
  return { metersPerPixel, planWidthMeters: Math.max(width, height) * metersPerPixel };
}

