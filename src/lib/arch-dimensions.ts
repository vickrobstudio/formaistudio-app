// Standard architectural & interior dimensions (metric, residential unless noted).
// Injected into AI assistant system prompts so suggestions are realistic.
export const ARCH_DIMENSIONS_REFERENCE = `STANDARD ARCHITECTURAL & INTERIOR DIMENSIONS (metres unless noted) — use these as defaults whenever the user has not specified a value, and quote them when proposing.

WALLS, FLOORS, CEILINGS
• Residential wall (floor-to-ceiling): 2.40 short / 2.70 standard / 3.00 generous
• Commercial / loft wall: 3.00–4.50
• Floor slab thickness: 0.15 (residential), 0.20–0.25 (commercial)
• Interior partition thickness: 0.10–0.12 ; load-bearing 0.20–0.30 ; exterior cavity 0.30–0.40
• Ceiling height = wall height by default ; dropped ceiling soffit 0.20–0.40 below

DOORS
• Interior door: 0.80 × 2.10 (standard), 0.90 × 2.10 (accessible)
• Entry door: 0.90–1.00 × 2.10
• Double / french door leaf pair: 1.60–1.80 × 2.10
• Sliding patio door: 1.80–2.40 × 2.10
• Garage door: 2.40 × 2.10 (single), 4.80 × 2.10 (double)
• Door frame jamb thickness: ~0.04

WINDOWS
• Sill height (living rooms): 0.90 above floor
• Sill height (bedrooms / kitchens): 1.10
• Sill height (bathrooms): 1.50–1.70
• Head height aligned with door: 2.10
• Standard pane height: 1.20 ; large picture window 1.80–2.40
• Width varies — typical 0.60 / 0.90 / 1.20 / 1.80

ROOFS
• Flat roof parapet: 0.40–1.10 (1.10 if accessible terrace)
• Gable pitch: 25–35° residential, 10–15° modern
• Hip pitch: 20–30°
• Shed / mono-pitch: 5–15°
• Overhang / eave: 0.40–0.80
• Roof slab / deck thickness: 0.20

STAIRS (residential)
• Riser: 0.17–0.19 ; Tread: 0.25–0.28
• Min width: 0.90 ; comfortable 1.10
• Headroom above stair: 2.00 minimum
• Landing depth: ≥ stair width
• Handrail height: 0.90–1.00

CIRCULATION
• Corridor width: 0.90 min, 1.20 generous, 1.50 accessible
• Wheelchair turning circle: 1.50 Ø
• Door swing clearance: 0.30 beside latch side

KITCHEN
• Counter height: 0.90 ; depth 0.60 ; toe-kick 0.10 × 0.10
• Upper cabinet height above counter: 0.45–0.60 ; depth 0.30–0.35
• Island min clearance around: 1.00 ; 1.20 with two cooks
• Fridge: 0.60–0.90 W × 0.65 D × 1.80 H
• Dishwasher / oven: 0.60 × 0.60 × 0.85
• Range hood above cooktop: 0.65–0.75

BATHROOM
• Toilet: 0.40 W × 0.70 D × 0.80 H ; 0.60 clear in front, 0.20 each side
• Sink / vanity: 0.55 D × 0.85 H ; basin 0.50 × 0.40
• Shower: 0.90 × 0.90 min ; 1.20 × 0.90 comfortable
• Bathtub: 1.70 × 0.70 × 0.55
• Towel rail height: 1.20

BEDROOM FURNITURE
• Single bed: 0.90 × 2.00 ; Double 1.40 × 2.00 ; Queen 1.60 × 2.00 ; King 1.80 × 2.00
• Mattress height off floor (top): 0.55–0.65
• Nightstand: 0.45 × 0.40 × 0.55
• Wardrobe: 1.00–2.40 W × 0.60 D × 2.10 H
• Min clearance around bed: 0.60

LIVING / DINING
• Sofa 2-seat: 1.60 × 0.85 × 0.85 (seat 0.42) ; 3-seat 2.10 × 0.90
• Coffee table: 1.20 × 0.60 × 0.40
• Dining chair: 0.45 × 0.50 × 0.85 (seat 0.45)
• Dining table: 0.75–0.90 W × 0.75 H, length per seat 0.60
• TV viewing distance: 2.5× screen diagonal
• Bookshelf: 0.80 W × 0.30 D × 1.80–2.10 H

OFFICE / WORKSPACE
• Desk: 1.20–1.60 × 0.60–0.80 × 0.75 H
• Office chair seat: 0.42–0.48
• Clearance behind desk: 0.90

OUTDOOR / SITE
• Parking space: 2.50 × 5.00 ; aisle 6.00
• Driveway width: 3.00 single, 5.50 double
• Sidewalk: 1.20 min
• Step at entry: 0.15 riser
• Fence / wall: 1.80 privacy, 1.10 guard

STRUCTURAL ELEMENTS
• Column (residential): 0.30 × 0.30 ; commercial 0.40–0.60
• Beam depth: span / 12 to span / 15
• Standard module / grid: 0.60 or 1.20`;