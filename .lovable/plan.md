## New flow for the 2D to 3D tool

Replace the current single-shot "upload → download .dae" flow with three approval stages:

```text
Upload PDF/JPG/PNG
      │
      ▼
[1] AI builds a MASTER PROMPT from the drawing
      │      (reads plan, elevations, callouts, reference photo)
      ▼
[2] AI renders a hero IMAGE of the finished piece
      │      → user APPROVES or asks for a re-render with notes
      ▼
[3] AI extracts the geometry JSON (parts + materials)
      │
      ▼
[4] LIVE 3D PREVIEW in the browser (rotate / zoom / pan, real materials)
      │      → user clicks Download
      ▼
[5] .dae export — one group per material/texture
```

### Step 1 · Master prompt
- New server fn `buildMasterPrompt({ fileDataUrl })` calls Gemini with the upload and returns a single rich paragraph: piece type, overall shape and silhouette, every distinct part with its dimensions and material (e.g. "oval calacatta stone top with 1/8 in scalloped reveal, oak edge band, 3 in Ø tapered oak column, brass footrest ring, oak base disc, heavy-duty glides"), lighting, camera framing.
- Shown to the user in an editable textarea so they can tweak before rendering.

### Step 2 · Approval rendering
- New server route `src/routes/api/render-preview.ts` streams an image from `google/gemini-3-pro-image-preview` using the master prompt (reuses existing `streamImage` helper, same pattern as Photo to AI).
- UI shows the streamed image with progressive blur, and two buttons: **Approve & build 3D** / **Re-render** (lets user edit the prompt and re-stream).

### Step 3 · Geometry extraction
- After approval, call the existing `generateFloor3D` server fn but with an upgraded furniture schema that adds a `material` field per part (one of: `stone_white`, `stone_dark`, `wood_oak`, `wood_walnut`, `wood_dark`, `metal_brass`, `metal_chrome`, `metal_black`, `fabric_neutral`, `leather_dark`, `glass`, `plastic_white`, `plastic_black`, `other`) plus an optional free-text `materialNote`.
- The existing primitives (box / cylinder / ellipse_cylinder / tapered_cylinder / torus / rounded_box, bullnose, etc.) stay as-is.

### Step 4 · Live 3D preview in the browser
- Add a `<Furniture3DPreview>` component using `three` + `@react-three/fiber` + `@react-three/drei` (already common in this template's family; install if missing).
- Render parts directly from the geometry JSON using the same primitive functions in client-side three.js geometry builders. Assign each part a PBR material derived from its `material` field:
  - stone → marble-ish white/grey with subtle roughness
  - wood_oak / walnut / dark → warm tinted with medium roughness
  - metal_brass / chrome / black → metalness 1, low roughness, matching color
  - glass → transmissive
  - fabric / leather / plastic → matte tints
- `<OrbitControls>` for rotate / zoom / pan, soft `<Environment preset="studio">` for nice highlights, a contact shadow, and a "Reset view" button.

### Step 5 · .dae download with grouped materials
- Build the .dae server-side as today, but group parts BY MATERIAL (not one group per part). Each material group gets its own `<geometry>`, `<node>`, and its own Collada `<material>`/`<effect>` with the matching diffuse colour, so SketchUp/Blender import shows distinct material layers ("Stone — White", "Wood — Oak", "Metal — Brass", etc.).
- Each material's diffuse/specular/roughness chosen to match the live preview, so what the user approves on screen is what they get in the file.

### UI changes (`src/components/FloorTo3D.tsx`)
The page becomes a small stepper:
1. Upload + units + subject (unchanged).
2. Master prompt (editable) + **Render preview**.
3. Streamed preview image with **Re-render** / **Approve & build 3D**.
4. Live 3D viewer with orbit controls + **Download .dae**.

State machine: `idle → prompted → rendering → approved → extracting → ready`. Each step can be revisited (re-render, regenerate geometry).

### Files to add / change

Add
- `src/lib/floor-3d-prompt.functions.ts` — `buildMasterPrompt` server fn.
- `src/routes/api/render-preview.ts` — streaming image route for the approval render.
- `src/components/Furniture3DPreview.tsx` — three.js viewer that builds meshes from the geometry JSON and applies PBR materials per part.

Change
- `src/lib/floor-3d.functions.ts` — add `material` + `materialNote` to `PartSchema`, group .dae geometry by material, generate one `<effect>`/`<material>` per material with proper colors.
- `src/components/FloorTo3D.tsx` — new four-step UI with master prompt editor, streamed render preview, live 3D viewer, download button.

### Costs / credits
- Master prompt = 1 chat call (cheap).
- Render image = 1 image generation (same cost as other image tools).
- Geometry extraction = 1 chat call (Gemini 2.5 Pro, as today).
- The wallet still consumes 1 credit per full run; re-renders before approval do NOT consume additional credits (or we charge a fractional retry — confirm if you'd like).

### Open question
For the approval render style, should I bias the master prompt toward **photoreal studio product photography** (matches your "8K luxury editorial" core memory), or toward a **clean isometric 3D render** that more closely matches what the .dae will look like? Default if no answer: photoreal studio photography.
