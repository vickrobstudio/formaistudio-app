export type PlanId =
  | "pro_monthly"
  | "tool_2d_to_3d_monthly"
  | "tool_studio_ai_monthly"
  | "tool_model_to_ai_monthly"
  | "tool_ai_edits_monthly"
  | "tool_ai_to_video_monthly";

export interface Plan {
  id: PlanId;
  name: string;
  priceUsd: number;
  credits: number;
  tools: string[]; // route paths this plan unlocks
  blurb: string;
}

export const PLANS: Plan[] = [
  {
    id: "pro_monthly",
    name: "FormAI Pro",
    priceUsd: 45,
    credits: 2000,
    tools: ["/2d-to-3d", "/studio", "/model-to-ai", "/ai-edits", "/photo-to-ai", "/ai-to-video"],
    blurb: "Every FormAI tool unlocked — the complete suite.",
  },
  {
    id: "tool_2d_to_3d_monthly",
    name: "2D to 3D",
    priceUsd: 20,
    credits: 500,
    tools: ["/2d-to-3d"],
    blurb: "Turn 2D plan drawings into a complete 3D model.",
  },
  {
    id: "tool_ai_edits_monthly",
    name: "AI Edits",
    priceUsd: 15,
    credits: 500,
    tools: ["/ai-edits"],
    blurb: "Photoshop-style edits on any image, in seconds.",
  },
  {
    id: "tool_model_to_ai_monthly",
    name: "3D to AI",
    priceUsd: 10,
    credits: 400,
    tools: ["/model-to-ai"],
    blurb: "Line perspectives from any 3D software into realistic AI renderings.",
  },
  {
    id: "tool_ai_to_video_monthly",
    name: "AI to Video",
    priceUsd: 10,
    credits: 200,
    tools: ["/ai-to-video"],
    blurb: "Turn a sequence of AI renderings into an AI video.",
  },
  {
    id: "tool_studio_ai_monthly",
    name: "Studio AI",
    priceUsd: 5,
    credits: 300,
    tools: ["/studio"],
    blurb: "A full project from a few filters and specs to high-end realistic renderings.",
  },
];

export const FREE_TOOLS = ["/photo-to-ai"];

export const PLAN_BY_ID: Record<string, Plan> = Object.fromEntries(PLANS.map((p) => [p.id, p]));

export function creditsForPlan(planId: string | null | undefined): number {
  if (!planId) return 0;
  return PLAN_BY_ID[planId]?.credits ?? 0;
}

export function toolUnlockedBy(activePlans: ReadonlySet<string>, toolPath: string): boolean {
  if (FREE_TOOLS.includes(toolPath)) return true;
  for (const id of activePlans) {
    const plan = PLAN_BY_ID[id];
    if (plan?.tools.includes(toolPath)) return true;
  }
  return false;
}