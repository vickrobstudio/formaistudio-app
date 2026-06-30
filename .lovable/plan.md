## Goal

Add a new "Mark & Lift" annotation workflow to the 2D-to-3D tool: AI auto-detects building elements on each uploaded floor plan, paints them as colored overlays, the user re-colors / fixes any regions, then we lift those colored masks into 3D groups — one editable group per color, with fixed heights per type.

## User flow

1. User uploads a floor plan (existing upload step).
2. New "Detect elements" button appears next to each floor.
3. AI returns segmentation: arrays of polygons + a type label per region (`wall`, `door`, `window`, `floor_slab`, `roof_outline`, `fixture`).
4. Annotation canvas opens (overlay on the original drawing):
   - Color palette on the right with the 5 element types (each has a fixed color + fixed height default).
   - Click a polygon to recolor / reassign type.
   - "Brush fix" tool to repaint regions the AI missed.
   - Add / delete polygons with simple click-to-draw.
5. User taps "Lift to 3D". We send the annotated polygon set (in plan-units, with type per polygon) to the server; server extrudes each type with its fixed height, returns one DAE group per color.
6. Result opens in the existing `Building3DViewer` — groups already named and colored per element type, ready to download as `.dae`.

## Fixed defaults (height + color per type)

| Type       | Height | Color    | Notes                                          |
|------------|--------|----------|------------------------------------------------|
| Walls      | 2.70 m | #C8C8C8  | Solid extrusion, openings subtracted           |
| Doors      | 2.10 m | #A0522D  | Cut opening in walls; door leaf as own group   |
| Windows    | 1.20 m | #87CEEB  | Sill 0.90 m; cut opening, glass pane group     |
| Floor slab | 0.15 m | #8B7355  | Below walls; from outline polygon              |
| Roof       | 0.20 m | #654321  | Flat slab on top of topmost floor              |
| Fixtures   | 0.90 m | #BFA37C  | Placeholder block per polygon                  |

## Technical details

**New server function** `src/lib/floor-3d-segment.functions.ts`
- `detectFloorElements({ imageDataUrl, planUnits })` → `{ polygons: Array<{ id, type, points: [x,y][], confidence }> , imageWidth, imageHeight, scale }`
- Calls Lovable AI Gateway with `google/gemini-2.5-flash-image` using the prompt:
  *"Return JSON polygons for: walls (centerlines as thick polylines), doors, windows, floor outline, roof outline, fixtures. Coordinates normalized 0-1."*
- Strict JSON via `Output.object` zod schema.

**New server function** `liftAnnotatedFloor({ floor, polygons, planScale })`
- For each `wall` polygon: extrude prism (thickness 0.15 m, height per type), boolean-subtract door/window openings that fall inside.
- For each `door`/`window`: extrude rectangular block at sill height.
- For `floor_slab` / `roof`: extrude thin slab.
- For `fixture`: extrude bbox block.
- Group by type → produce one `<library_geometries>` + `<node>` per group, color set from the table above (writes `<color sid="diffuse">` in the effect).
- Reuse existing DAE writer in `src/lib/mesh-export.server.ts` if possible; otherwise add a small helper that emits the per-group nodes.

**New component** `src/components/FloorAnnotator.tsx`
- Renders the floor image in an SVG overlay (1:1 with image natural size, fit to container).
- Polygons are SVG `<polygon>` with fill = type color, opacity 0.45.
- Right panel: type palette (radio-style). Selecting a type then clicking a polygon recolors it.
- Tools: `Select` (default), `Brush` (click-and-drag to draw new polygon), `Delete` (click polygon to remove).
- State held locally; emits the final polygon list on "Lift to 3D".

**FloorTo3D wiring** `src/components/FloorTo3D.tsx`
- Per floor entry add `polygons?: Polygon[]` plus `detected: boolean`.
- New row of buttons under each floor: `Detect elements` → calls `detectFloorElements`, opens `FloorAnnotator` modal.
- After annotation save: store polygons on the floor.
- In `buildFromDrawings`: if a floor has `polygons`, call new `liftAnnotatedFloor` server fn instead of the existing `generateFloor3D` for that step. Falls back to the existing pipeline if no annotation.

**Viewer**
- `Building3DViewer` already supports per-group color and visibility. No changes needed — the new DAE already carries the right group names (`Walls`, `Doors`, `Windows`, `Floor`, `Roof`, `Fixtures`) and diffuse colors.

## Out of scope (this turn)

- Door/window cutting via real CSG (we use additive blocks + an opening box subtracted only when straightforward; complex CSG can come later).
- Multi-image fusion (only the first image per floor is annotated; secondary images remain reference for the AI-only path).
- AI-inferred dimensions — we keep "Fixed defaults per type" as the user chose.
