# Cleanup & Simplify Pass

Aggressive simplification across the four areas you picked, driven by a real audit first so I'm fixing actual problems, not guessing.

## Phase 1 — Audit (no code changes)

Run a single pass to surface real defects and friction:

1. Drive the live preview with Playwright across the key flows (landing → tools hub → each tool entry → 2D→3D upload → DWG importer → auth → wallet → settings). Capture screenshots + console + network for each step.
2. Static scan: dead imports, unused components, oversized files (DetectionEditor, PdfSetImporter, ImageStudio), duplicate buttons, inconsistent copy/casing (e.g. "VIP · Unlimited" vs other labels), missing empty states, missing error states.
3. Produce a short defect list with severity (crash > broken UX > clutter > copy).

I will share that list back before touching code in Phase 2/3 if anything looks risky.

## Phase 2 — Bugs & crashes

Fix everything from the audit tagged crash/broken UX. Likely candidates based on recent work:
- DWG/DXF importer: surface precheck errors as a clean inline message (no thrown stack), allow retry without page reload.
- DetectionEditor: guard against empty `workingRef`/`activeFloor` before exporting; disable export buttons when not ready (some already disabled, verify all paths).
- ToolEntry upload button: actual `<input type="file">` is missing — the button looks tappable but does nothing. Wire it to the tool's real handler or route, otherwise remove the affordance.
- Auth redirect-back: confirm `/auth` returns the user to the tool they came from after sign-in.

## Phase 3 — Aggressive simplification

Per-screen rules:

- **Landing**: keep logo + single Enter button + legal. Remove any secondary CTAs or chips.
- **Tools hub**: 6 cards, equal weight, no "All-access bundle" row above the grid (move to Wallet/Pricing). One tagline per tool, max 4 words.
- **Tool entry pages**: one big upload dropzone, one primary button, collapse the "How it works" steps into a single 2-line sentence + a "Learn more" disclosure that opens the full `ToolInformation` block. Hide credit count behind a small chip in the header instead of a paragraph.
- **DWG importer dialog**: collapse the 7-rule checklist into a single sentence + "See requirements" disclosure. Keep precheck errors verbose only when triggered.
- **DetectionEditor sidebar**: group export actions (SVG / PNG / Shapes SVG / Shapes PNG) under one "Export" menu instead of 4 stacked buttons.
- **Auth / Wallet / Account / Settings**: remove duplicate nav, ensure every screen has a back link, unify button styles (`variant="studio"`, h-12), unify empty states.

Copy pass: shorter labels, sentence case, remove jargon ("rasterize", "precheck"), error messages always end with a next action.

## Out of scope

- No backend / schema / RLS changes.
- No new features, no redesign of the visual language (beige landing, SF Pro, black buttons stay per memory).
- No changes to the 3D pipeline logic itself, only its UI surface.

## Deliverable

One PR-style batch of edits across `src/components/*` and `src/routes/*`, plus a short summary of what was removed vs. kept. If the audit surfaces something that needs a design decision (e.g. "should the bundle row go to Pricing or Wallet?"), I'll ask before changing it.
