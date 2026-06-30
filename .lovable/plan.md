
# 2D→3D flow restructure

Rework `/2d-to-3d` so the AI assistant only appears during 3D generation, and the new first step after upload is automatic element detection that the user can recolor or replan before building.

## New flow

```text
1. Upload plans + elevations
2. AI autodetect elements         ← NEW first step (no chat yet)
   - walls, doors, windows, rooms, stairs per floor
   - returns labeled regions + bounding outlines per uploaded plan
3. Review & adjust                 ← NEW
   a. Filter / toggle detected elements (hide false positives)
   b. Recolor per area / room type (kitchen, bath, bedroom, circulation…)
   c. Or tap "Replan with AI" → AI redraws a simpler cleaned floor plan
      the user can accept as the working plan
4. Build 3D model
5. Live 3D viewer + AI chat side-by-side  ← chat ONLY opens here
   - user asks questions, tweaks heights/roof while watching the model render
```

The pre-build `BuildAssistant` panel and its "Open chat / Auto-detect" buttons are removed from the upload step.

## UI changes

- `FloorTo3D.tsx`
  - Remove the `<BuildAssistant>` block that renders after floor uploads.
  - Add a new `Step: Detect elements` card shown once ≥1 floor plan exists.
    - Button: "Auto-detect elements". Calls a new server fn per plan.
    - Result: thumbnail of each plan with detected items overlaid (SVG outlines + colored fills by category).
  - Add a `DetectionEditor` panel:
    - Left: per-floor plan with overlay; tap an element to toggle / recolor / relabel.
    - Right: legend with category colors (editable color swatches) + visibility toggles.
    - Action: "Replan with AI" → generates a clean simplified plan (PNG) the user can accept; accepted plan replaces that floor's `imageDataUrl` going into the 3D build.
  - "Build 3D model" button stays, but is disabled until detection has run at least once.
  - When build starts, render a new split layout: live 3D viewer (existing) on the left, `BuildChat` docked panel on the right (or bottom on mobile). Chat is gone otherwise.

- `BuildAssistant.tsx`
  - Rename surface to `BuildChat`; drop the collapsed "Open chat" card and the standalone "Auto-detect" button (autodetect moved to the dedicated step).
  - Always-open dock variant used only inside the build/viewer screen.
  - Continue attaching plan images to messages so the model has full context for questions during the build.

## New server work

- `src/lib/floor-detect.functions.ts` — `detectElements({ imageDataUrl })`
  - Calls `google/gemini-3-flash-preview` with the plan image + structured `Output.object` schema:
    - `elements: [{ id, category: 'wall'|'door'|'window'|'stair'|'room'|'fixture', label, polygon: [[x,y]…], confidence }]`
    - normalized 0–1 coordinates.
  - Returns a small JSON the client overlays as SVG on the original plan.

- `src/lib/floor-replan.functions.ts` — `replanFloor({ imageDataUrl, edits })`
  - Uses the image model (`google/gemini-3-pro-image` or current default) to generate a cleaned top-down line-drawing version of the plan, honoring user color/category edits.
  - Returns a new data URL the user can accept as the working plan.

Both functions read `LOVABLE_API_KEY` inside the handler via the existing `@/lib/ai-gateway.server` helper.

## State shape additions (FloorTo3D)

```ts
type Detection = {
  elements: Array<{
    id: string;
    category: "wall"|"door"|"window"|"stair"|"room"|"fixture";
    label: string;
    polygon: Array<[number, number]>; // 0..1
    color?: string;       // user override
    hidden?: boolean;     // user toggle
  }>;
};
const [detections, setDetections] = useState<Record<number, Detection>>({});
const [replanned, setReplanned] = useState<Record<number, string>>({}); // floorIdx → new dataUrl
```

`buildFromDrawings` picks `replanned[i] ?? floors[i].imageDataUrl` as the plan to lift into 3D, and forwards detection metadata to the existing recon server fn so wall/door/window placement uses the cleaned data instead of pure pixel guessing.

## Build-time chat

- New `<BuildChatDock>` rendered only when `stage === "modeling"` or `"ready"`.
- Same `useChat` transport as today, but opens automatically, sits next to the 3D viewer, and carries the detection JSON in `context` so questions like "make all bedroom walls 2.6 m" can be acted on as proposal patches.

## Out of scope

- No backend persistence of detections (kept in component state per session).
- No multi-user collaboration on the editor.
- No change to the furniture / single-object flow on the same page.

## Open question

The "Replan with AI" simplified plan: should the AI-generated cleaner plan fully **replace** the user's uploaded plan as the source for the 3D build, or only be shown as a visual reference while the original plan is still used? Default in this plan: replace, with an "Undo / use original" toggle.
