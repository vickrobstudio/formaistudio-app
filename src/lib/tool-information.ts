import type { ToolInfoSection } from "@/components/ToolInformation";

export const studioInformation: ToolInfoSection[] = [
  { title: "Room plan & exact furniture", description: "Upload a room plan, then add reference images of furniture created in FormAI Studio or from any existing source.", items: ["Optional plan upload: PDF, JPG or PNG up to 10 MB", "Attach clear images of every exact furniture piece to place in the proposal", "Choose feet or meters, then enter width, length and height", "Choose Indoor or Outdoor, then select the room purpose"] },
  { title: "100% reference fidelity", items: ["Preserve each referenced piece’s exact silhouette, proportions and construction details", "Match visible materials, grain, weave, color and surface texture without substitution", "Use multiple views when available for more accurate placement", "Set the room style, palette, finishes, use and furniture budget independently"] },
  { title: "Your design output", items: ["2D floor plan with furniture layout and dimensions", "8K-target luxury editorial rendering with referenced furniture placed naturally", "True-to-life color, balanced HDR light, accurate textures and material response", "Downloadable rendering and project saved to your cloud"] },
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
  { title: "Credits and access", items: ["Sign in to use Photo AI for free", "Photo AI chat, edit reviews and images do not consume credits", "Your guest conversation stays on this device", "Signed-in users can save one conversation to their account"] },
];

