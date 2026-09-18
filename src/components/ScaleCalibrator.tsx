import { parseArchitecturalMeasurement } from "@/lib/architectural-measurement";
import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Two-point scale calibration: the user clicks both ends of a feature with a
 * known real-world length (a dimensioned wall, a scale bar) and types that
 * length. We convert to the real-world width of the image's LONGER side —
 * the reference the extraction pipeline scales against.
 */
export function ScaleCalibrator({
  imageDataUrl,
  label,
  planUnits,
  onCalibrated,
  onClose,
}: {
  imageDataUrl: string;
  label: string;
  planUnits: "feet-inches" | "meters";
  onCalibrated: (planWidthMeters: number) => void;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<Array<[number, number]>>([]);
  const [distance, setDistance] = useState("");
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  const [error, setError] = useState("");
  const unitLabel = planUnits === "feet-inches" ? "feet" : "meters";

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPoints((prev) => (prev.length >= 2 ? [[x, y]] : [...prev, [x, y]]));
  };

  const apply = () => {
    let meters: number;
    try { meters = parseArchitecturalMeasurement(distance, unitLabel); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid dimension"); return; }
    if (!imgSize || points.length !== 2) return;
    const [[x1, y1], [x2, y2]] = points;
    const distPx = Math.hypot((x2 - x1) * imgSize.w, (y2 - y1) * imgSize.h);
    if (distPx < 4) { setError("Select points farther apart."); return; }
    const mPerPx = meters / distPx;
    onCalibrated(Math.max(imgSize.w, imgSize.h) * mPerPx);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white text-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Calibrate scale</h2>
            <p className="mt-0.5 text-[11px] text-neutral-600">
              {points.length < 2
                ? `Click both ends of a feature with a known length on ${label} (${2 - points.length} click${points.length === 1 ? "" : "s"} left)`
                : `Enter the real distance between the two points in ${unitLabel}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative flex-1 overflow-auto bg-neutral-100 p-3">
          <div className="relative mx-auto cursor-crosshair" onClick={handleClick}>
            <img
              src={imageDataUrl}
              alt=""
              draggable={false}
              className="block h-auto w-full select-none"
              onLoad={(e) =>
                setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
            />
            <svg
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              {points.length === 2 && (
                <line
                  x1={points[0][0]}
                  y1={points[0][1]}
                  x2={points[1][0]}
                  y2={points[1][1]}
                  stroke="#e11d48"
                  strokeWidth={0.004}
                />
              )}
              {points.map(([x, y], i) => (
                <g key={i}>
                  <line
                    x1={x - 0.012}
                    y1={y}
                    x2={x + 0.012}
                    y2={y}
                    stroke="#e11d48"
                    strokeWidth={0.003}
                  />
                  <line
                    x1={x}
                    y1={y - 0.012}
                    x2={x}
                    y2={y + 0.012}
                    stroke="#e11d48"
                    strokeWidth={0.003}
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>
        {error && <p role="alert" className="px-4 text-sm text-red-700">{error}</p>}
        <div className="flex items-center gap-2 border-t border-neutral-200 px-4 py-3">
          <Input
            type="text"
            aria-label="Known dimension"
            min="0"
            step="any"
            placeholder={`Real distance in ${unitLabel}`}
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            className="flex-1 bg-white text-black"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPoints([]);
              setDistance("");
            }}
          >
            Reset
          </Button>
          <Button
            type="button"
            disabled={points.length !== 2 || !distance.trim()}
            onClick={apply}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}


