import type { ToolInfoSection } from "@/components/ToolInformation";

export const studioInformation: ToolInfoSection[] = [
  { title: "Room plan & exact products", description: "Upload your plan first, or continue without one and enter the room’s overall dimensions manually.", items: ["Optional plan upload: PDF, JPG or PNG up to 10 MB", "Attach pictures of exact furniture or objects to place in the proposal", "Choose feet or meters, then enter width, length and height", "Choose Indoor or Outdoor, then select the room purpose"] },
  { title: "Design direction", items: ["Set design style, color palette and up to four custom colors", "Choose new materials, finishes and the amount of interior vegetation", "Define the room’s primary use and furniture budget", "Select preferred furniture brands or add custom brands"] },
  { title: "Your design package", items: ["2D floor plan with furniture layout and dimensions", "Immersive 360° virtual tour", "Two to three photorealistic renderings from multiple angles", "Curated furniture suggestions and detailed budget document"] },
];

export const modelInformation: ToolInfoSection[] = [
  { title: "Perspective to prepare", items: ["Upload one JPG, PNG or WebP perspective exported from any 2D or 3D design software", "Keep material colors, finishes and textures visible in the source", "AI preserves the original camera, geometry and design intent while adding photorealism"] },
  { title: "Project settings", items: ["Choose an interior or exterior rendering", "Set building type and ceiling height", "Add an optional project location for region-accurate backgrounds and vegetation", "Choose month and hour for accurate sunlight, shadows and lighting"] },
  { title: "AI output", items: ["Photorealistic renderings from multiple camera angles", "Location-accurate architectural context and vegetation", "Time-based sun position and shadow direction"] },
];

export const editsInformation: ToolInfoSection[] = [
  { title: "Instant adjustments", items: ["Brightness, contrast and saturation", "Color temperature from cool to warm", "Live preview with original and edited comparison"] },
  { title: "AI changes", items: ["Materials: marble, wood, concrete, brushed metal or terrazzo", "Lighting: warm and cozy, cool modern, natural daylight, dramatic or soft diffused", "Time of day: sunrise, daytime, golden hour, sunset, blue hour or night", "Wallpaper, object colors and art styles including abstract, contemporary, classical, photography and minimal"] },
  { title: "Workflow", items: ["Upload an interior image", "Adjust sliders or select AI-powered changes", "Generate the edit, compare it with the original and download the result"] },
];

export const videoInformation: ToolInfoSection[] = [
  { title: "Upload requirements", items: ["Upload two to five interior renderings; at least two are required", "Use a different angle or space in each image", "Choose your strongest, most consistent views for smooth transitions"] },
  { title: "Video output", items: ["10-second professional cinematic sequence", "Multi-angle presentation with smooth camera movements", "HD-quality, high-resolution downloadable video"] },
];

export const photoInformation: ToolInfoSection[] = [
  { title: "What Photo AI can do", description: "Upload a real photo of an empty, raw or damaged space and transform it through conversation.", items: ["Add or replace furniture", "Change floors, walls and other materials", "Adjust natural or ambient lighting", "Add plants, artwork and decor", "Completely redesign the room in a new style"] },
  { title: "Ideas to try", items: ["Add a modern minimalist sofa in neutral tones", "Change the flooring to elegant white marble", "Add warm, cozy ambient lighting", "Add Monstera and Fiddle Leaf Fig plants", "Try Art Deco or Scandinavian styling"] },
  { title: "Free for everyone", items: ["No account or credits required", "Your guest conversation stays on this device", "Signed-in users can save one conversation to their account"] },
];