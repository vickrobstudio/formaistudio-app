## Goal

Kill the current "raster image + checker background + flood-fill paint bucket" surface. Replace it with a true interactive vector editor: every line is a pickable element, every enclosed shape is a selectable polygon you can paint or drag, all rendered as clean SVG on a real white sheet (no checker, no pixelation).

## What it will look like

```text
┌──────────────────────────────────────────────────────────┐
│  white sheet (subtle paper texture, faint grid)          │
│                                                          │
│   ┌──────────────┐ ┌───────────────────────────┐         │
│   │  Bedroom 1   │ │       Living              │         │
│   │  (filled)    │ │     (filled, selected →   │         │
│   │              │ │      blue outline +       │         │
│   │              │ │      drag handles)        │         │
│   └──────────────┘ └───────────────────────────┘         │
│   ──────── ←── pickable wall line (highlights on hover)  │
│                                                          │
│  Toolbar: [Select] [Paint] [Move] [+ wall] [Delete]      │
└──────────────────────────────────────────────────────────┘
```

No checker, no transparency artifacts, no pixelated raster — vector SVG only.

## Pipeline change

We already extract vector polygons (`extractRoomRegions` returns pixel polygons via Moore-neighbor + RDP). Today we throw the polygons away and re-paint them onto a canvas. We will:

1. Keep the cleaned plan as a faint background reference layer (faded, no checker, on white).
2. Trace every wall stroke as an SVG `<path>` (skeletonize the line mask + vectorize so each contiguous wall is one path).
3. Render every enclosed region polygon as an SVG `<polygon>` with `fill`, `stroke`, `pointer-events: all`.
4. Everything lives in one `<svg>` viewBox; the user pans/zooms the SVG, not a raster.

## Interactions

- **Hover a wall line** → it lights up; click selects it (toolbar shows color + thickness).
- **Hover an enclosed shape** → faint highlight; click selects it.
- **Paint mode** → clicking a shape fills it with the active legend color; clicking a wall recolors that wall path.
- **Move mode** → drag a selected shape to translate it; drag a wall endpoint to reshape.
- **Delete** key removes the selected shape or line.
- Multi-select with shift-click. Undo/redo already exists — reuse it on the new model.

Existing zoom in/out/fit controls stay; they now zoom the SVG viewBox instead of CSS-scaling a raster.

## Data model change

Replace `paintedDataUrl` (PNG) with a structured shape list:

```ts
type FloorVectorModel = {
  walls: Array<{ id; d: string; stroke: string; width: number }>;
  shapes: Array<{ id; polygon: number[][]; fill: string; category; label }>;
  bgRefDataUrl?: string; // faded plan, optional
};
```

`paintedDataUrl` is regenerated on export by rasterizing the SVG — downstream 3D lift still gets a bitmap when it needs one.

## Files to change

- `src/components/DetectionEditor.tsx` — rip out the canvas/img/checker block, render an `<svg>` instead, add Select/Paint/Move tool state, click + drag handlers per element.
- `src/lib/floor-pipeline.ts` — add `vectorizeWalls(mask, w, h)` that returns SVG path strings for each connected wall stroke (thinning + chain-following).
- New `src/components/FloorVectorEditor.tsx` (split out of DetectionEditor) — pure SVG editor component, props in/out only.
- Keep flood-fill room extraction; feed its polygons straight into the SVG model on first clean.

## Out of scope (ask before adding)

- Reshaping walls by adding new vertices (only endpoint drag for now).
- Snapping walls to a grid.
- Boolean ops on shapes (union / subtract).

## Risks / notes

- Large plans → thousands of SVG elements. We will cap wall paths by simplification (RDP epsilon) and group hit-testing.
- The 3D lift step downstream still expects a painted raster; we keep a server-rasterize-on-export step so the rest of the pipeline doesn't move.
