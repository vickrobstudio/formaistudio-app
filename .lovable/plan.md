## Goal
For buildings, replace the single-image upload + master-prompt flow with a multi-image upload organized by drawing type. The 3D model is built directly from those drawings (no editorial prompt, no approval render) so it matches the plans and elevations exactly.

## UI changes (`src/components/FloorTo3D.tsx`)
When `subject === "building"`, swap the single uploader for three labeled slots:

- **Floor plans (one image per floor, bottom → top)** — add/remove rows; each row has its own file picker, label (auto "Ground floor", "Floor 1"…) and editable floor-to-floor height.
- **Roof plan** — single image, optional.
- **Elevations** — multi-image (North / South / East / West / other), each tagged with its facing direction.

Remove for the building flow:
- Step 2 "Write master prompt" and the prompt textarea
- Step 3 approval render preview + "Approve & build"
- Reference photos block

Furniture flow is untouched.

After all required uploads (≥1 floor) the CTA becomes **"Build 3D model from drawings"** and goes straight to the live 3D preview + .dae/.obj/.fbx download.

## Server changes (`src/lib/floor-3d.functions.ts`)
Extend `FloorTo3DInput` with an optional `building` payload:

```ts
building: {
  floors: Array<{ imageDataUrl, label, heightMeters }>,  // ordered ground → top
  roof?:  { imageDataUrl },
  elevations: Array<{ imageDataUrl, facing: "N"|"S"|"E"|"W"|"other", label? }>,
}
```

When present (and `subject === "building"`):
1. Skip the existing single-file building vectorizer.
2. Send ONE multimodal Gemini request containing every floor plan, the roof, and every elevation as `image_url` parts, each preceded by a text part identifying it (`"Floor 0 — ground, height 3.0 m"`, `"Elevation — North"`, `"Roof plan"`).
3. New instruction `multiFloorBuildingInstruction()` asks the model to return a richer JSON: same wall/column/stair/fixture schema, but wrapped per floor with `floorIndex`, plus a top-level `roof: { kind:"flat"|"gable"|"hip"|"shed", parameters... }` derived from the roof plan + elevations. Elevations are used to lock overall heights, window/door head & sill heights, and roof pitch.
4. Geometry assembly: stack floors at cumulative Z offsets using each floor's height; emit one `.dae` group per floor (`Floor_0`, `Floor_1`, `Roof`) so SketchUp/Blender shows them as separate layers. Reuse the existing wall/opening/column/stair triangulation for each floor.

Old single-image building path stays as a fallback if the new `building` payload is absent.

## Out of scope
- No editorial rendering of the building.
- Furniture flow unchanged.
- Mesh reconstruction (Trellis) path unchanged.

## Tech notes
- The Lovable Gateway chat-completions endpoint already accepts multiple `image_url` parts in one user message — same shape used today for reference images.
- Total payload stays under the existing `MAX_TOTAL_IMAGE_INPUT` guard; we'll cap at 8 floor plans + 1 roof + 6 elevations.
- `wallHeightMeters` becomes a per-floor value; the legacy single field is dropped from the building UI.
