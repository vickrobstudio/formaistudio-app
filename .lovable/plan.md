
# Full floor-plan pipeline

Goal: turn an uploaded PDF/PNG plan into a clean stack of labeled room polygons, wall/door/window vectors, and per-room masks, then feed that data into the existing 3D build.

The existing code already covers some steps (PDF clean in `PdfSetImporter.tsx`, flood-fill bounding boxes in `DetectionEditor.tsx`, AI element detection in `floor-detect.functions.ts`). This plan replaces the rough pieces with a single coherent pipeline.

## Pipeline stages

```text
PDF/PNG
  ↓ 1. Clean        (PdfSetImporter — keep, tighten)
  ↓ 2. Vector pass  (NEW: pixel→line segments, Hough-style)
  ↓ 3. Wall network (NEW: segment merge + thickness classify)
  ↓ 4. Openings     (NEW: door arc + window double-line detection)
  ↓ 5. Gap closure  (extend existing morphological close)
  ↓ 6. Flood fill   (already in DetectionEditor — keep)
  ↓ 7. Polygonize   (NEW: marching-squares + Douglas-Peucker on each region,
                     replacing today's bounding-box output)
  ↓ 8. Semantic AI  (extend floor-detect.functions.ts: send polygons +
                     cropped masks, get {category,label,confidence} per region)
  ↓ 9. Masks        (NEW: per-room PNG mask layer, stored on Detection state)
  ↓ 10. 3D feed     (mesh-recon.functions.ts already accepts detection meta —
                     wire wall network + room polygons through)
```

## File changes

- `src/lib/floor-pipeline.ts` (NEW) — pure client module orchestrating steps 2–7 + 9 on a canvas. Exports `runPipeline(canvas) → { walls, doors, windows, rooms: [{polygon, mask, bbox}] }`. Marching-squares + RDP polygon simplification, Hough-lite line detector, door-arc heuristic (quarter-circle inside wall break), window heuristic (two parallel short segments inside a wall break).
- `src/lib/floor-classify.functions.ts` (NEW) — server fn. Takes the polygon list + a low-res annotated thumbnail; calls `google/gemini-3-flash-preview` with a strict JSON schema returning `{ id, category, label, confidence }[]`. Cheaper and more accurate than the current full-image free-form detect because the AI only labels regions we already extracted.
- `src/components/DetectionEditor.tsx` — replace current `detectEnclosedRegions` bounding-box pass with `runPipeline` + `classifyRegions`. Render real polygons (SVG path), keep existing recolor/toggle UI. Each region carries `mask` for downstream use.
- `src/components/PdfSetImporter.tsx` — minor: ensure cleaned canvas exports a high-contrast binary suitable for the vector pass (already close).
- `src/lib/mesh-recon.functions.ts` — accept new `pipeline` payload `{ walls, openings, rooms }` and prefer it over pixel guessing when present. Backwards compatible.
- `src/components/FloorTo3D.tsx` — forward `detections[i].pipeline` into the build call.

## State additions

```ts
// in DetectionEditor / FloorTo3D
type Region = {
  id: string;
  polygon: [number, number][];   // 0..1
  mask: string;                  // dataURL of the room's binary mask
  bbox: [number, number, number, number];
  category: "room"|"wall"|"door"|"window"|"stair"|"fixture";
  label: string;                 // "Kitchen", "Bath 1"…
  confidence: number;
  color?: string;
  hidden?: boolean;
};
type Pipeline = {
  walls: { a:[number,number]; b:[number,number]; thickness:number }[];
  doors: { center:[number,number]; width:number; angle:number }[];
  windows: { a:[number,number]; b:[number,number] }[];
  rooms: Region[];
};
```

`pipeline` lives next to today's `elements` so existing manual recolor/toggle keeps working.

## Out of scope (this pass)

- BIM-grade IFC export.
- Dimension OCR / numeric scale extraction.
- Hatch/material classification (will use a flat per-category color until step 10 is wired).
- Furniture instance segmentation — kept as a single "fixture" category from the AI step.

## Risks

- Hough-lite on cleaned binary is heuristic; CAD plans with light hatching may produce noisy segments. Mitigation: pipeline is layered — even if wall vectorization is weak, flood-fill rooms (step 6–7) still produce usable polygons, and the AI classification step (8) labels them.
- Door/window heuristic is the weakest link. We fall back to "wall break wider than X = door, narrower = window" when the arc isn't detected.
- `google/gemini-3-flash-preview` JSON-mode is reliable for short schemas; we cap at 80 regions.

## Implementation order

1. `floor-pipeline.ts` — get polygon extraction working in isolation (replace bounding boxes in DetectionEditor first; visible win immediately).
2. `floor-classify.functions.ts` + DetectionEditor integration — rooms get real labels.
3. Wall/door/window vector pass added to the same pipeline.
4. Wire `pipeline` payload through `FloorTo3D` → `mesh-recon`.

Each step ships independently; the UI keeps working between steps.
