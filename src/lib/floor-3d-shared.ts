/**
 * Shared, client-safe types and material palette used by both the server-side
 * .dae export (`floor-3d.functions.ts`) and the in-browser three.js preview
 * (`Furniture3DPreview.tsx`). Keep this file dependency-free so it can be
 * imported anywhere.
 *
 * The palette intentionally covers ~200 architectural materials so a whole
 * building (envelope, structure, interior, landscape) can be exported with
 * one named material per layer in SketchUp / Blender.
 */

export const MATERIAL_IDS = [
  // --- Stone / masonry ---
  "stone_white", "stone_dark",
  "stone_marble_carrara", "stone_marble_calacatta", "stone_marble_black",
  "stone_marble_green", "stone_marble_emperador",
  "stone_travertine", "stone_limestone", "stone_sandstone", "stone_basalt",
  "stone_granite_light", "stone_granite_dark", "stone_slate", "stone_bluestone",
  "stone_terrazzo_white", "stone_terrazzo_warm", "stone_terrazzo_dark",
  "stone_quartzite", "stone_onyx",
  "stone_river_rock", "stone_gravel_light", "stone_gravel_dark", "stone_cobble",
  // --- Brick / block / concrete ---
  "brick_red", "brick_red_dark", "brick_buff", "brick_white_painted",
  "brick_black", "brick_handmade", "brick_glazed_white",
  "cmu_grey", "cmu_split_face",
  "concrete_smooth", "concrete_board_formed", "concrete_precast",
  "concrete_polished", "concrete_exposed_aggregate", "concrete_white", "concrete_dark",
  "shotcrete", "mortar_grey", "mortar_white", "grout_light", "grout_dark",
  // --- Plaster / render / paint ---
  "plaster_white", "plaster_warm",
  "stucco_white", "stucco_sand", "stucco_grey",
  "venetian_plaster", "lime_wash_white", "lime_wash_ochre", "tadelakt",
  "paint_white_matte", "paint_white_eggshell", "paint_offwhite",
  "paint_warm_grey", "paint_cool_grey", "paint_charcoal", "paint_black_matte",
  "paint_navy", "paint_forest_green", "paint_sage", "paint_terracotta",
  "paint_mustard", "paint_cream", "paint_taupe",
  // --- Wood ---
  "wood_oak", "wood_oak_white", "wood_oak_smoked", "wood_oak_reclaimed",
  "wood_walnut", "wood_walnut_dark", "wood_maple", "wood_ash", "wood_birch",
  "wood_cherry", "wood_mahogany", "wood_teak", "wood_ipe",
  "wood_cedar", "wood_cypress", "wood_pine", "wood_douglas_fir", "wood_bamboo",
  "wood_plywood", "wood_osb", "wood_mdf",
  "wood_charred_shou_sugi_ban",
  "wood_painted_white", "wood_painted_black", "wood_painted_sage",
  "wood_dark",
  // --- Metals ---
  "metal_brass", "metal_brass_brushed", "metal_brass_antique",
  "metal_bronze", "metal_copper", "metal_copper_patina",
  "metal_chrome", "metal_stainless_brushed", "metal_stainless_polished",
  "metal_aluminum_brushed", "metal_aluminum_anodized_black", "metal_aluminum_white",
  "metal_zinc", "metal_lead", "metal_steel_raw", "metal_steel_painted",
  "metal_corten", "metal_galvanized", "metal_iron_wrought",
  "metal_gold", "metal_nickel", "metal_gunmetal", "metal_black",
  "metal_perforated", "metal_mesh", "metal_expanded",
  // --- Glass ---
  "glass", "glass_clear", "glass_low_iron",
  "glass_tinted_grey", "glass_tinted_bronze", "glass_tinted_blue", "glass_tinted_green",
  "glass_frosted", "glass_reeded", "glass_fluted",
  "glass_mirror", "glass_smoked", "glass_laminated", "glass_block",
  // --- Ceramics / tile ---
  "tile_ceramic_white", "tile_porcelain_white", "tile_porcelain_black",
  "tile_subway_white",
  "tile_zellige_white", "tile_zellige_green", "tile_zellige_blue", "tile_zellige_terracotta",
  "tile_mosaic_blue", "tile_mosaic_white", "tile_encaustic_pattern",
  "tile_clay_terracotta", "tile_saltillo", "tile_slate", "tile_marble",
  // --- Roofing ---
  "roof_clay_tile_terracotta", "roof_clay_tile_dark",
  "roof_concrete_tile", "roof_slate_dark",
  "roof_metal_standing_seam", "roof_metal_corrugated",
  "roof_copper", "roof_zinc",
  "roof_shingle_asphalt", "roof_thatch", "roof_green",
  "roof_membrane_white", "roof_membrane_grey",
  // --- Flooring ---
  "floor_wood_oak_plank", "floor_wood_walnut_plank",
  "floor_wood_herringbone", "floor_wood_chevron",
  "floor_vinyl_lvt", "floor_linoleum", "floor_rubber",
  "floor_epoxy_white", "floor_epoxy_grey",
  "floor_carpet_neutral", "floor_carpet_grey", "floor_carpet_dark",
  "floor_rug_wool", "floor_sisal", "floor_jute",
  // --- Fabric / upholstery ---
  "fabric_neutral", "fabric_linen_natural", "fabric_linen_white", "fabric_cotton",
  "fabric_wool_boucle",
  "fabric_velvet_green", "fabric_velvet_blue", "fabric_velvet_rust",
  "fabric_canvas", "fabric_felt_grey", "fabric_outdoor",
  "fabric_drape_sheer", "fabric_drape_blackout",
  // --- Leather ---
  "leather_dark", "leather_cognac", "leather_black", "leather_white",
  "leather_tan", "leather_suede",
  // --- Plastics / composites / solid surface ---
  "plastic_white", "plastic_black", "plastic_translucent",
  "acrylic_clear", "acrylic_white", "polycarbonate",
  "laminate_white", "laminate_wood", "laminate_black",
  "solid_surface_white", "solid_surface_warm",
  "quartz_engineered_white", "quartz_engineered_grey",
  "frp_panel", "hpl_panel",
  // --- Insulation / sheathing ---
  "insulation_batt", "insulation_rigid_foam", "insulation_spray_foam",
  "gypsum_board", "cement_board", "sheathing_osb", "vapor_barrier",
  // --- Site / landscape / water ---
  "soil", "mulch_dark", "grass", "turf_artificial",
  "planting_green", "planting_hedge", "bark",
  "sand_light", "sand_warm",
  "water_pool", "water_pond",
  "asphalt", "decomposed_granite",
  "pavers_concrete", "pavers_clay", "pavers_stone",
  // --- Misc ---
  "rubber_black", "cork", "rattan", "wicker", "rope_natural",
  "paper_wall", "wallpaper_pattern", "marble_dust",
  "mirror", "led_strip", "light_diffuser",
  "other",
] as const;

export type MaterialId = (typeof MATERIAL_IDS)[number];

export type MaterialSpec = {
  id: MaterialId;
  label: string;
  // 0..1 diffuse colour for both PBR preview and Collada export.
  color: [number, number, number];
  roughness: number;
  metalness: number;
  // 0 = opaque, >0 = light transmission (glass).
  transmission?: number;
  ior?: number;
};

const M = (
  id: MaterialId,
  label: string,
  color: [number, number, number],
  roughness: number,
  metalness: number,
  extra: { transmission?: number; ior?: number } = {},
): [MaterialId, MaterialSpec] => [id, { id, label, color, roughness, metalness, ...extra }];

export const MATERIAL_PALETTE: Record<MaterialId, MaterialSpec> = Object.fromEntries([
  // Stone / masonry
  M("stone_white",              "Stone — White / Marble",     [0.93, 0.91, 0.87], 0.35, 0),
  M("stone_dark",               "Stone — Dark",                [0.28, 0.28, 0.30], 0.45, 0),
  M("stone_marble_carrara",     "Marble — Carrara",            [0.92, 0.92, 0.90], 0.25, 0),
  M("stone_marble_calacatta",   "Marble — Calacatta",          [0.95, 0.94, 0.91], 0.22, 0),
  M("stone_marble_black",       "Marble — Black",              [0.10, 0.10, 0.11], 0.25, 0),
  M("stone_marble_green",       "Marble — Green",              [0.18, 0.30, 0.22], 0.30, 0),
  M("stone_marble_emperador",   "Marble — Emperador",          [0.32, 0.20, 0.14], 0.30, 0),
  M("stone_travertine",         "Travertine",                  [0.80, 0.72, 0.58], 0.55, 0),
  M("stone_limestone",          "Limestone",                   [0.84, 0.80, 0.70], 0.55, 0),
  M("stone_sandstone",          "Sandstone",                   [0.82, 0.68, 0.50], 0.65, 0),
  M("stone_basalt",             "Basalt",                      [0.18, 0.18, 0.20], 0.55, 0),
  M("stone_granite_light",      "Granite — Light",             [0.72, 0.70, 0.68], 0.40, 0),
  M("stone_granite_dark",       "Granite — Dark",              [0.22, 0.22, 0.24], 0.40, 0),
  M("stone_slate",              "Slate",                       [0.24, 0.26, 0.28], 0.55, 0),
  M("stone_bluestone",          "Bluestone",                   [0.34, 0.38, 0.42], 0.55, 0),
  M("stone_terrazzo_white",     "Terrazzo — White",            [0.90, 0.88, 0.85], 0.40, 0),
  M("stone_terrazzo_warm",      "Terrazzo — Warm",             [0.82, 0.74, 0.62], 0.40, 0),
  M("stone_terrazzo_dark",      "Terrazzo — Dark",             [0.25, 0.24, 0.24], 0.40, 0),
  M("stone_quartzite",          "Quartzite",                   [0.88, 0.86, 0.82], 0.30, 0),
  M("stone_onyx",               "Onyx",                        [0.90, 0.80, 0.62], 0.20, 0, { transmission: 0.25, ior: 1.5 }),
  M("stone_river_rock",         "River Rock",                  [0.55, 0.52, 0.48], 0.55, 0),
  M("stone_gravel_light",       "Gravel — Light",              [0.72, 0.70, 0.66], 0.85, 0),
  M("stone_gravel_dark",        "Gravel — Dark",               [0.32, 0.30, 0.28], 0.85, 0),
  M("stone_cobble",             "Cobblestone",                 [0.50, 0.48, 0.46], 0.70, 0),
  // Brick / block / concrete
  M("brick_red",                "Brick — Red",                 [0.62, 0.30, 0.24], 0.75, 0),
  M("brick_red_dark",           "Brick — Red Dark",            [0.42, 0.20, 0.16], 0.75, 0),
  M("brick_buff",               "Brick — Buff",                [0.78, 0.66, 0.50], 0.75, 0),
  M("brick_white_painted",      "Brick — White Painted",       [0.92, 0.90, 0.86], 0.80, 0),
  M("brick_black",              "Brick — Black",               [0.12, 0.12, 0.12], 0.75, 0),
  M("brick_handmade",           "Brick — Handmade",            [0.66, 0.42, 0.32], 0.80, 0),
  M("brick_glazed_white",       "Brick — Glazed White",        [0.94, 0.94, 0.92], 0.20, 0),
  M("cmu_grey",                 "CMU — Grey",                  [0.60, 0.60, 0.60], 0.85, 0),
  M("cmu_split_face",           "CMU — Split Face",            [0.55, 0.53, 0.50], 0.90, 0),
  M("concrete_smooth",          "Concrete — Smooth",           [0.66, 0.66, 0.65], 0.55, 0),
  M("concrete_board_formed",    "Concrete — Board-Formed",     [0.62, 0.62, 0.60], 0.65, 0),
  M("concrete_precast",         "Concrete — Precast",          [0.70, 0.70, 0.68], 0.55, 0),
  M("concrete_polished",        "Concrete — Polished",         [0.58, 0.58, 0.58], 0.25, 0),
  M("concrete_exposed_aggregate","Concrete — Exposed Agg.",   [0.62, 0.60, 0.56], 0.80, 0),
  M("concrete_white",           "Concrete — White",            [0.86, 0.85, 0.82], 0.55, 0),
  M("concrete_dark",            "Concrete — Dark",             [0.30, 0.30, 0.30], 0.60, 0),
  M("shotcrete",                "Shotcrete",                   [0.55, 0.54, 0.52], 0.85, 0),
  M("mortar_grey",              "Mortar — Grey",               [0.60, 0.60, 0.58], 0.85, 0),
  M("mortar_white",             "Mortar — White",              [0.88, 0.87, 0.84], 0.85, 0),
  M("grout_light",              "Grout — Light",               [0.82, 0.80, 0.76], 0.80, 0),
  M("grout_dark",               "Grout — Dark",                [0.22, 0.22, 0.22], 0.80, 0),
  // Plaster / render / paint
  M("plaster_white",            "Plaster — White",             [0.92, 0.91, 0.88], 0.85, 0),
  M("plaster_warm",             "Plaster — Warm",              [0.90, 0.84, 0.74], 0.85, 0),
  M("stucco_white",             "Stucco — White",              [0.90, 0.88, 0.84], 0.90, 0),
  M("stucco_sand",              "Stucco — Sand",               [0.82, 0.74, 0.62], 0.90, 0),
  M("stucco_grey",              "Stucco — Grey",               [0.62, 0.62, 0.60], 0.90, 0),
  M("venetian_plaster",         "Venetian Plaster",            [0.86, 0.82, 0.74], 0.30, 0),
  M("lime_wash_white",          "Limewash — White",            [0.92, 0.90, 0.86], 0.95, 0),
  M("lime_wash_ochre",          "Limewash — Ochre",            [0.78, 0.62, 0.42], 0.95, 0),
  M("tadelakt",                 "Tadelakt",                    [0.80, 0.74, 0.66], 0.35, 0),
  M("paint_white_matte",        "Paint — White Matte",         [0.94, 0.94, 0.92], 0.95, 0),
  M("paint_white_eggshell",     "Paint — White Eggshell",      [0.94, 0.94, 0.92], 0.55, 0),
  M("paint_offwhite",           "Paint — Off-White",           [0.92, 0.90, 0.85], 0.85, 0),
  M("paint_warm_grey",          "Paint — Warm Grey",           [0.66, 0.62, 0.58], 0.85, 0),
  M("paint_cool_grey",          "Paint — Cool Grey",           [0.62, 0.64, 0.66], 0.85, 0),
  M("paint_charcoal",           "Paint — Charcoal",            [0.20, 0.20, 0.22], 0.85, 0),
  M("paint_black_matte",        "Paint — Black Matte",         [0.06, 0.06, 0.07], 0.95, 0),
  M("paint_navy",               "Paint — Navy",                [0.10, 0.16, 0.30], 0.80, 0),
  M("paint_forest_green",       "Paint — Forest Green",        [0.14, 0.28, 0.20], 0.80, 0),
  M("paint_sage",               "Paint — Sage",                [0.62, 0.70, 0.58], 0.85, 0),
  M("paint_terracotta",         "Paint — Terracotta",          [0.72, 0.38, 0.26], 0.85, 0),
  M("paint_mustard",            "Paint — Mustard",             [0.80, 0.62, 0.20], 0.85, 0),
  M("paint_cream",              "Paint — Cream",               [0.94, 0.90, 0.80], 0.85, 0),
  M("paint_taupe",              "Paint — Taupe",               [0.70, 0.64, 0.56], 0.85, 0),
  // Wood
  M("wood_oak",                 "Wood — Oak",                  [0.78, 0.60, 0.40], 0.55, 0),
  M("wood_oak_white",           "Wood — White Oak",            [0.84, 0.72, 0.54], 0.55, 0),
  M("wood_oak_smoked",          "Wood — Smoked Oak",           [0.40, 0.30, 0.22], 0.55, 0),
  M("wood_oak_reclaimed",       "Wood — Reclaimed Oak",        [0.55, 0.42, 0.30], 0.70, 0),
  M("wood_walnut",              "Wood — Walnut",               [0.36, 0.22, 0.14], 0.55, 0),
  M("wood_walnut_dark",         "Wood — Walnut Dark",          [0.24, 0.14, 0.10], 0.50, 0),
  M("wood_maple",               "Wood — Maple",                [0.86, 0.74, 0.56], 0.55, 0),
  M("wood_ash",                 "Wood — Ash",                  [0.82, 0.74, 0.60], 0.55, 0),
  M("wood_birch",               "Wood — Birch",                [0.88, 0.78, 0.62], 0.55, 0),
  M("wood_cherry",              "Wood — Cherry",               [0.55, 0.30, 0.22], 0.50, 0),
  M("wood_mahogany",            "Wood — Mahogany",             [0.38, 0.18, 0.12], 0.50, 0),
  M("wood_teak",                "Wood — Teak",                 [0.60, 0.42, 0.26], 0.55, 0),
  M("wood_ipe",                 "Wood — Ipe",                  [0.32, 0.22, 0.16], 0.55, 0),
  M("wood_cedar",               "Wood — Cedar",                [0.62, 0.42, 0.30], 0.65, 0),
  M("wood_cypress",             "Wood — Cypress",              [0.70, 0.58, 0.42], 0.65, 0),
  M("wood_pine",                "Wood — Pine",                 [0.86, 0.72, 0.50], 0.65, 0),
  M("wood_douglas_fir",         "Wood — Douglas Fir",          [0.78, 0.58, 0.36], 0.60, 0),
  M("wood_bamboo",              "Wood — Bamboo",               [0.82, 0.72, 0.50], 0.55, 0),
  M("wood_plywood",             "Plywood",                     [0.80, 0.66, 0.46], 0.70, 0),
  M("wood_osb",                 "OSB",                         [0.72, 0.58, 0.36], 0.85, 0),
  M("wood_mdf",                 "MDF",                         [0.66, 0.52, 0.38], 0.85, 0),
  M("wood_charred_shou_sugi_ban","Shou Sugi Ban",             [0.08, 0.07, 0.07], 0.80, 0),
  M("wood_painted_white",       "Wood — Painted White",        [0.94, 0.93, 0.90], 0.55, 0),
  M("wood_painted_black",       "Wood — Painted Black",        [0.08, 0.08, 0.09], 0.55, 0),
  M("wood_painted_sage",        "Wood — Painted Sage",         [0.62, 0.70, 0.58], 0.55, 0),
  M("wood_dark",                "Wood — Ebony",                [0.16, 0.12, 0.10], 0.50, 0),
  // Metals
  M("metal_brass",              "Metal — Brass",               [0.83, 0.69, 0.39], 0.25, 1),
  M("metal_brass_brushed",      "Metal — Brushed Brass",       [0.80, 0.66, 0.38], 0.45, 1),
  M("metal_brass_antique",      "Metal — Antique Brass",       [0.55, 0.42, 0.22], 0.55, 1),
  M("metal_bronze",             "Metal — Bronze",              [0.55, 0.36, 0.20], 0.45, 1),
  M("metal_copper",             "Metal — Copper",              [0.85, 0.50, 0.32], 0.35, 1),
  M("metal_copper_patina",      "Metal — Copper Patina",       [0.30, 0.62, 0.55], 0.65, 0),
  M("metal_chrome",             "Metal — Chrome",              [0.86, 0.86, 0.88], 0.08, 1),
  M("metal_stainless_brushed",  "Metal — Brushed Stainless",   [0.78, 0.78, 0.80], 0.35, 1),
  M("metal_stainless_polished", "Metal — Polished Stainless",  [0.82, 0.82, 0.84], 0.12, 1),
  M("metal_aluminum_brushed",   "Metal — Brushed Aluminum",    [0.80, 0.80, 0.82], 0.40, 1),
  M("metal_aluminum_anodized_black","Metal — Aluminum Black", [0.12, 0.12, 0.13], 0.35, 1),
  M("metal_aluminum_white",     "Metal — Aluminum White",      [0.90, 0.90, 0.90], 0.40, 0),
  M("metal_zinc",               "Metal — Zinc",                [0.55, 0.56, 0.58], 0.45, 1),
  M("metal_lead",               "Metal — Lead",                [0.40, 0.40, 0.42], 0.55, 1),
  M("metal_steel_raw",          "Metal — Raw Steel",           [0.45, 0.45, 0.47], 0.45, 1),
  M("metal_steel_painted",      "Metal — Painted Steel",       [0.20, 0.20, 0.22], 0.55, 0),
  M("metal_corten",             "Metal — Corten",              [0.50, 0.28, 0.18], 0.75, 0),
  M("metal_galvanized",         "Metal — Galvanized",          [0.72, 0.74, 0.76], 0.40, 1),
  M("metal_iron_wrought",       "Metal — Wrought Iron",        [0.10, 0.10, 0.10], 0.55, 1),
  M("metal_gold",               "Metal — Gold",                [0.95, 0.78, 0.32], 0.20, 1),
  M("metal_nickel",             "Metal — Nickel",              [0.78, 0.78, 0.75], 0.25, 1),
  M("metal_gunmetal",           "Metal — Gunmetal",            [0.25, 0.26, 0.28], 0.35, 1),
  M("metal_black",              "Metal — Black",               [0.10, 0.10, 0.11], 0.35, 1),
  M("metal_perforated",         "Metal — Perforated",          [0.55, 0.55, 0.57], 0.45, 1),
  M("metal_mesh",               "Metal — Mesh",                [0.55, 0.55, 0.57], 0.55, 1),
  M("metal_expanded",           "Metal — Expanded",            [0.50, 0.50, 0.52], 0.55, 1),
  // Glass
  M("glass",                    "Glass",                       [0.85, 0.90, 0.92], 0.05, 0, { transmission: 0.85, ior: 1.5 }),
  M("glass_clear",              "Glass — Clear",               [0.90, 0.94, 0.95], 0.02, 0, { transmission: 0.92, ior: 1.5 }),
  M("glass_low_iron",           "Glass — Low Iron",            [0.93, 0.96, 0.95], 0.02, 0, { transmission: 0.95, ior: 1.5 }),
  M("glass_tinted_grey",        "Glass — Tinted Grey",         [0.55, 0.58, 0.60], 0.05, 0, { transmission: 0.60, ior: 1.5 }),
  M("glass_tinted_bronze",      "Glass — Tinted Bronze",       [0.55, 0.45, 0.32], 0.05, 0, { transmission: 0.55, ior: 1.5 }),
  M("glass_tinted_blue",        "Glass — Tinted Blue",         [0.45, 0.60, 0.75], 0.05, 0, { transmission: 0.60, ior: 1.5 }),
  M("glass_tinted_green",       "Glass — Tinted Green",        [0.55, 0.72, 0.62], 0.05, 0, { transmission: 0.60, ior: 1.5 }),
  M("glass_frosted",            "Glass — Frosted",             [0.88, 0.90, 0.92], 0.45, 0, { transmission: 0.55, ior: 1.5 }),
  M("glass_reeded",             "Glass — Reeded",              [0.86, 0.90, 0.92], 0.30, 0, { transmission: 0.60, ior: 1.5 }),
  M("glass_fluted",             "Glass — Fluted",              [0.86, 0.90, 0.92], 0.30, 0, { transmission: 0.60, ior: 1.5 }),
  M("glass_mirror",             "Glass — Mirror",              [0.95, 0.95, 0.96], 0.02, 1),
  M("glass_smoked",             "Glass — Smoked",              [0.20, 0.20, 0.22], 0.10, 0, { transmission: 0.40, ior: 1.5 }),
  M("glass_laminated",          "Glass — Laminated",           [0.86, 0.90, 0.92], 0.05, 0, { transmission: 0.80, ior: 1.5 }),
  M("glass_block",              "Glass Block",                 [0.82, 0.88, 0.90], 0.20, 0, { transmission: 0.55, ior: 1.5 }),
  // Ceramics / tile
  M("tile_ceramic_white",       "Tile — Ceramic White",        [0.94, 0.94, 0.92], 0.20, 0),
  M("tile_porcelain_white",     "Tile — Porcelain White",      [0.94, 0.94, 0.93], 0.15, 0),
  M("tile_porcelain_black",     "Tile — Porcelain Black",      [0.08, 0.08, 0.09], 0.15, 0),
  M("tile_subway_white",        "Tile — Subway White",         [0.94, 0.94, 0.92], 0.18, 0),
  M("tile_zellige_white",       "Tile — Zellige White",        [0.90, 0.90, 0.86], 0.25, 0),
  M("tile_zellige_green",       "Tile — Zellige Green",        [0.30, 0.50, 0.40], 0.25, 0),
  M("tile_zellige_blue",        "Tile — Zellige Blue",         [0.25, 0.42, 0.62], 0.25, 0),
  M("tile_zellige_terracotta",  "Tile — Zellige Terracotta",   [0.72, 0.38, 0.26], 0.25, 0),
  M("tile_mosaic_blue",         "Tile — Mosaic Blue",          [0.20, 0.40, 0.62], 0.30, 0),
  M("tile_mosaic_white",        "Tile — Mosaic White",         [0.90, 0.92, 0.92], 0.30, 0),
  M("tile_encaustic_pattern",   "Tile — Encaustic",            [0.70, 0.65, 0.55], 0.45, 0),
  M("tile_clay_terracotta",     "Tile — Terracotta",           [0.72, 0.40, 0.28], 0.70, 0),
  M("tile_saltillo",            "Tile — Saltillo",             [0.72, 0.46, 0.32], 0.75, 0),
  M("tile_slate",               "Tile — Slate",                [0.26, 0.28, 0.30], 0.55, 0),
  M("tile_marble",              "Tile — Marble",               [0.92, 0.91, 0.88], 0.25, 0),
  // Roofing
  M("roof_clay_tile_terracotta","Roof — Clay Tile Terracotta", [0.70, 0.36, 0.24], 0.75, 0),
  M("roof_clay_tile_dark",      "Roof — Clay Tile Dark",       [0.30, 0.20, 0.18], 0.75, 0),
  M("roof_concrete_tile",       "Roof — Concrete Tile",        [0.45, 0.45, 0.46], 0.75, 0),
  M("roof_slate_dark",          "Roof — Slate Dark",           [0.20, 0.22, 0.24], 0.55, 0),
  M("roof_metal_standing_seam", "Roof — Standing Seam",        [0.30, 0.30, 0.32], 0.45, 1),
  M("roof_metal_corrugated",    "Roof — Corrugated Metal",     [0.55, 0.55, 0.57], 0.45, 1),
  M("roof_copper",              "Roof — Copper",               [0.85, 0.50, 0.32], 0.35, 1),
  M("roof_zinc",                "Roof — Zinc",                 [0.55, 0.56, 0.58], 0.45, 1),
  M("roof_shingle_asphalt",     "Roof — Asphalt Shingle",      [0.22, 0.22, 0.22], 0.85, 0),
  M("roof_thatch",              "Roof — Thatch",               [0.62, 0.50, 0.32], 0.95, 0),
  M("roof_green",               "Roof — Green",                [0.32, 0.50, 0.28], 0.95, 0),
  M("roof_membrane_white",      "Roof — Membrane White",       [0.90, 0.90, 0.88], 0.70, 0),
  M("roof_membrane_grey",       "Roof — Membrane Grey",        [0.45, 0.45, 0.46], 0.70, 0),
  // Flooring
  M("floor_wood_oak_plank",     "Floor — Oak Plank",           [0.78, 0.60, 0.40], 0.50, 0),
  M("floor_wood_walnut_plank",  "Floor — Walnut Plank",        [0.36, 0.22, 0.14], 0.50, 0),
  M("floor_wood_herringbone",   "Floor — Herringbone",         [0.70, 0.52, 0.34], 0.50, 0),
  M("floor_wood_chevron",       "Floor — Chevron",             [0.70, 0.52, 0.34], 0.50, 0),
  M("floor_vinyl_lvt",          "Floor — Vinyl LVT",           [0.66, 0.56, 0.44], 0.55, 0),
  M("floor_linoleum",           "Floor — Linoleum",            [0.70, 0.66, 0.58], 0.60, 0),
  M("floor_rubber",             "Floor — Rubber",              [0.18, 0.18, 0.18], 0.80, 0),
  M("floor_epoxy_white",        "Floor — Epoxy White",         [0.90, 0.90, 0.88], 0.25, 0),
  M("floor_epoxy_grey",         "Floor — Epoxy Grey",          [0.55, 0.55, 0.56], 0.25, 0),
  M("floor_carpet_neutral",     "Floor — Carpet Neutral",      [0.78, 0.74, 0.66], 0.98, 0),
  M("floor_carpet_grey",        "Floor — Carpet Grey",         [0.55, 0.55, 0.56], 0.98, 0),
  M("floor_carpet_dark",        "Floor — Carpet Dark",         [0.18, 0.18, 0.20], 0.98, 0),
  M("floor_rug_wool",           "Floor — Wool Rug",            [0.82, 0.74, 0.62], 0.95, 0),
  M("floor_sisal",              "Floor — Sisal",               [0.78, 0.66, 0.46], 0.95, 0),
  M("floor_jute",               "Floor — Jute",                [0.74, 0.62, 0.42], 0.95, 0),
  // Fabric / upholstery
  M("fabric_neutral",           "Fabric — Neutral",            [0.85, 0.81, 0.74], 0.95, 0),
  M("fabric_linen_natural",     "Fabric — Linen Natural",      [0.82, 0.76, 0.62], 0.95, 0),
  M("fabric_linen_white",       "Fabric — Linen White",        [0.92, 0.90, 0.85], 0.95, 0),
  M("fabric_cotton",            "Fabric — Cotton",             [0.90, 0.88, 0.84], 0.95, 0),
  M("fabric_wool_boucle",       "Fabric — Wool Bouclé",        [0.86, 0.82, 0.74], 0.98, 0),
  M("fabric_velvet_green",      "Fabric — Velvet Green",       [0.16, 0.30, 0.22], 0.75, 0),
  M("fabric_velvet_blue",       "Fabric — Velvet Blue",        [0.16, 0.24, 0.40], 0.75, 0),
  M("fabric_velvet_rust",       "Fabric — Velvet Rust",        [0.55, 0.24, 0.14], 0.75, 0),
  M("fabric_canvas",            "Fabric — Canvas",             [0.78, 0.72, 0.60], 0.95, 0),
  M("fabric_felt_grey",         "Fabric — Felt Grey",          [0.55, 0.55, 0.56], 0.98, 0),
  M("fabric_outdoor",           "Fabric — Outdoor",            [0.75, 0.72, 0.65], 0.92, 0),
  M("fabric_drape_sheer",       "Drape — Sheer",               [0.92, 0.90, 0.86], 0.85, 0, { transmission: 0.45, ior: 1.3 }),
  M("fabric_drape_blackout",    "Drape — Blackout",            [0.18, 0.18, 0.20], 0.95, 0),
  // Leather
  M("leather_dark",             "Leather — Dark",              [0.32, 0.18, 0.10], 0.60, 0),
  M("leather_cognac",           "Leather — Cognac",            [0.55, 0.30, 0.16], 0.55, 0),
  M("leather_black",            "Leather — Black",             [0.08, 0.08, 0.09], 0.60, 0),
  M("leather_white",            "Leather — White",             [0.90, 0.88, 0.84], 0.55, 0),
  M("leather_tan",              "Leather — Tan",               [0.66, 0.48, 0.32], 0.55, 0),
  M("leather_suede",            "Leather — Suede",             [0.50, 0.40, 0.30], 0.85, 0),
  // Plastics / composites
  M("plastic_white",            "Plastic — White",             [0.92, 0.92, 0.92], 0.40, 0),
  M("plastic_black",            "Plastic — Black",             [0.10, 0.10, 0.10], 0.40, 0),
  M("plastic_translucent",      "Plastic — Translucent",       [0.88, 0.90, 0.90], 0.35, 0, { transmission: 0.50, ior: 1.45 }),
  M("acrylic_clear",            "Acrylic — Clear",             [0.92, 0.94, 0.95], 0.08, 0, { transmission: 0.90, ior: 1.49 }),
  M("acrylic_white",            "Acrylic — White",             [0.94, 0.94, 0.92], 0.30, 0),
  M("polycarbonate",            "Polycarbonate",               [0.86, 0.90, 0.90], 0.25, 0, { transmission: 0.70, ior: 1.58 }),
  M("laminate_white",           "Laminate — White",            [0.94, 0.94, 0.92], 0.35, 0),
  M("laminate_wood",            "Laminate — Wood",             [0.72, 0.56, 0.38], 0.40, 0),
  M("laminate_black",           "Laminate — Black",            [0.08, 0.08, 0.09], 0.35, 0),
  M("solid_surface_white",      "Solid Surface — White",       [0.94, 0.93, 0.91], 0.30, 0),
  M("solid_surface_warm",       "Solid Surface — Warm",        [0.88, 0.82, 0.72], 0.30, 0),
  M("quartz_engineered_white",  "Quartz — Engineered White",   [0.92, 0.91, 0.88], 0.25, 0),
  M("quartz_engineered_grey",   "Quartz — Engineered Grey",    [0.62, 0.62, 0.62], 0.25, 0),
  M("frp_panel",                "FRP Panel",                   [0.88, 0.88, 0.86], 0.55, 0),
  M("hpl_panel",                "HPL Panel",                   [0.55, 0.50, 0.42], 0.45, 0),
  // Insulation / sheathing
  M("insulation_batt",          "Insulation — Batt",           [0.86, 0.78, 0.50], 0.98, 0),
  M("insulation_rigid_foam",    "Insulation — Rigid Foam",     [0.86, 0.50, 0.30], 0.85, 0),
  M("insulation_spray_foam",    "Insulation — Spray Foam",     [0.90, 0.88, 0.78], 0.95, 0),
  M("gypsum_board",             "Gypsum Board",                [0.93, 0.92, 0.88], 0.90, 0),
  M("cement_board",             "Cement Board",                [0.75, 0.74, 0.70], 0.85, 0),
  M("sheathing_osb",            "Sheathing — OSB",             [0.72, 0.58, 0.36], 0.85, 0),
  M("vapor_barrier",            "Vapor Barrier",               [0.20, 0.22, 0.24], 0.55, 0),
  // Site / landscape / water
  M("soil",                     "Soil",                        [0.30, 0.22, 0.16], 0.95, 0),
  M("mulch_dark",               "Mulch — Dark",                [0.20, 0.14, 0.10], 0.95, 0),
  M("grass",                    "Grass",                       [0.30, 0.50, 0.20], 0.95, 0),
  M("turf_artificial",          "Turf — Artificial",           [0.28, 0.46, 0.22], 0.85, 0),
  M("planting_green",           "Planting — Green",            [0.26, 0.44, 0.22], 0.92, 0),
  M("planting_hedge",           "Planting — Hedge",            [0.20, 0.36, 0.18], 0.95, 0),
  M("bark",                     "Bark",                        [0.36, 0.26, 0.18], 0.95, 0),
  M("sand_light",               "Sand — Light",                [0.86, 0.78, 0.60], 0.95, 0),
  M("sand_warm",                "Sand — Warm",                 [0.82, 0.68, 0.45], 0.95, 0),
  M("water_pool",               "Water — Pool",                [0.30, 0.62, 0.78], 0.05, 0, { transmission: 0.70, ior: 1.33 }),
  M("water_pond",               "Water — Pond",                [0.20, 0.34, 0.36], 0.15, 0, { transmission: 0.40, ior: 1.33 }),
  M("asphalt",                  "Asphalt",                     [0.18, 0.18, 0.20], 0.90, 0),
  M("decomposed_granite",       "Decomposed Granite",          [0.68, 0.58, 0.42], 0.95, 0),
  M("pavers_concrete",          "Pavers — Concrete",           [0.62, 0.62, 0.60], 0.80, 0),
  M("pavers_clay",              "Pavers — Clay",               [0.60, 0.30, 0.22], 0.80, 0),
  M("pavers_stone",             "Pavers — Stone",              [0.55, 0.52, 0.48], 0.75, 0),
  // Misc
  M("rubber_black",             "Rubber — Black",              [0.10, 0.10, 0.11], 0.85, 0),
  M("cork",                     "Cork",                        [0.66, 0.50, 0.32], 0.85, 0),
  M("rattan",                   "Rattan",                      [0.78, 0.62, 0.42], 0.80, 0),
  M("wicker",                   "Wicker",                      [0.70, 0.56, 0.38], 0.80, 0),
  M("rope_natural",             "Rope — Natural",              [0.72, 0.62, 0.46], 0.95, 0),
  M("paper_wall",               "Paper — Wall",                [0.92, 0.90, 0.86], 0.95, 0),
  M("wallpaper_pattern",        "Wallpaper — Pattern",         [0.78, 0.72, 0.66], 0.85, 0),
  M("marble_dust",              "Marble Dust",                 [0.92, 0.90, 0.86], 0.85, 0),
  M("mirror",                   "Mirror",                      [0.96, 0.96, 0.97], 0.02, 1),
  M("led_strip",                "LED Strip",                   [1.00, 0.96, 0.86], 0.25, 0),
  M("light_diffuser",           "Light Diffuser",              [0.95, 0.95, 0.94], 0.40, 0, { transmission: 0.65, ior: 1.45 }),
  M("other",                    "Other",                       [0.78, 0.78, 0.78], 0.50, 0),
]) as Record<MaterialId, MaterialSpec>;

export type PartShape =
  | "box"
  | "cylinder"
  | "ellipse_cylinder"
  | "tapered_cylinder"
  | "torus"
  | "rounded_box";

export type FurniturePart = {
  name?: string;
  shape: PartShape;
  cx: number; cy: number; cz: number;
  width: number; depth: number; height: number;
  rotationDegZ: number;
  topDiameter?: number;
  tubeDiameter?: number;
  edgeRadius?: number;
  material: MaterialId;
  materialNote?: string;
};

export type FurniturePlan = {
  kind: "furniture";
  units: "meters";
  bounds: { width: number; depth: number; height: number };
  parts: FurniturePart[];
};

export function materialFor(id: string | undefined): MaterialSpec {
  if (id && id in MATERIAL_PALETTE) return MATERIAL_PALETTE[id as MaterialId];
  return MATERIAL_PALETTE.other;
}