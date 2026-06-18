/**
 * Shared, client-safe types and material palette used by both the server-side
 * .dae export (`floor-3d.functions.ts`) and the in-browser three.js preview
 * (`Furniture3DPreview.tsx`). Keep this file dependency-free so it can be
 * imported anywhere.
 */

export const MATERIAL_IDS = [
  "stone_white",
  "stone_dark",
  "wood_oak",
  "wood_walnut",
  "wood_dark",
  "metal_brass",
  "metal_chrome",
  "metal_black",
  "fabric_neutral",
  "leather_dark",
  "glass",
  "plastic_white",
  "plastic_black",
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

export const MATERIAL_PALETTE: Record<MaterialId, MaterialSpec> = {
  stone_white: { id: "stone_white", label: "Stone — White / Marble", color: [0.93, 0.91, 0.87], roughness: 0.35, metalness: 0 },
  stone_dark:  { id: "stone_dark",  label: "Stone — Dark",            color: [0.28, 0.28, 0.30], roughness: 0.45, metalness: 0 },
  wood_oak:    { id: "wood_oak",    label: "Wood — Oak",              color: [0.78, 0.60, 0.40], roughness: 0.55, metalness: 0 },
  wood_walnut: { id: "wood_walnut", label: "Wood — Walnut",           color: [0.36, 0.22, 0.14], roughness: 0.55, metalness: 0 },
  wood_dark:   { id: "wood_dark",   label: "Wood — Ebony",            color: [0.16, 0.12, 0.10], roughness: 0.5, metalness: 0 },
  metal_brass: { id: "metal_brass", label: "Metal — Brass",           color: [0.83, 0.69, 0.39], roughness: 0.25, metalness: 1 },
  metal_chrome:{ id: "metal_chrome",label: "Metal — Chrome",          color: [0.86, 0.86, 0.88], roughness: 0.08, metalness: 1 },
  metal_black: { id: "metal_black", label: "Metal — Black",           color: [0.10, 0.10, 0.11], roughness: 0.35, metalness: 1 },
  fabric_neutral: { id: "fabric_neutral", label: "Fabric — Neutral",  color: [0.85, 0.81, 0.74], roughness: 0.95, metalness: 0 },
  leather_dark:   { id: "leather_dark",   label: "Leather — Cognac",  color: [0.32, 0.18, 0.10], roughness: 0.6,  metalness: 0 },
  glass:        { id: "glass",        label: "Glass",                 color: [0.85, 0.90, 0.92], roughness: 0.05, metalness: 0, transmission: 0.85, ior: 1.5 },
  plastic_white:{ id: "plastic_white",label: "Plastic — White",       color: [0.92, 0.92, 0.92], roughness: 0.4, metalness: 0 },
  plastic_black:{ id: "plastic_black",label: "Plastic — Black",       color: [0.10, 0.10, 0.10], roughness: 0.4, metalness: 0 },
  other:        { id: "other",        label: "Other",                  color: [0.78, 0.78, 0.78], roughness: 0.5, metalness: 0 },
};

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