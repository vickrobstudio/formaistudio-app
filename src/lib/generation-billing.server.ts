import { createHash } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isFormAIOwner } from "./owner-access";

export type GenerationKind = "image" | "drawing" | "assistant" | "review" | "mesh";
import { executeMeteredOperation, GenerationBillingError } from "./metered-operation";
export { GenerationBillingError } from "./metered-operation";
const counters = new WeakMap<Request, number>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const costs: Record<GenerationKind, number> = { image: 1, drawing: 1, assistant: 1, review: 1, mesh: 1 };
const db = () => supabaseAdmin as any;

export function billingEnvironment(): "live" | "sandbox" {
  // A Preview cannot spend or grant production credits, even if a client asks.
  return process.env.VERCEL_ENV === "production" ? "live" : "sandbox";
}

export async function billingIdentity(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new GenerationBillingError("Sign in before using AI tools.");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new GenerationBillingError("Your session expired. Please sign in again.");
  return data.user;
}

export async function authorizeAIUpload() {
  const request = getRequest();
  if (request.headers.get("x-formai-ai-consent") !== "openai-v2") throw new GenerationBillingError("Please accept AI data sharing before continuing.");
  const state = await readBillingState(request);
  if (!state.owner && state.paid + state.trial < 1) throw new GenerationBillingError("You have no credits available.");
  return state.user;
}

export async function registerPrediction(predictionId: string) {
  const user = await billingIdentity(getRequest());
  const { error } = await db().from("generation_predictions").insert({ prediction_id: predictionId, user_id: user.id });
  if (error) throw new GenerationBillingError("The 3D job started but its saved status needs verification. Contact support before retrying.");
}

export async function authorizePrediction(predictionId: string) {
  const user = await billingIdentity(getRequest());
  const { data, error } = await db().from("generation_predictions").select("prediction_id").eq("prediction_id", predictionId).eq("user_id", user.id).maybeSingle();
  if (error || !data) throw new GenerationBillingError("This 3D job is not available for your account.");
}

export async function readBillingState(request: Request) {
  const user = await billingIdentity(request);
  const environment = billingEnvironment();
  const provider = request.headers.get("x-formai-client") === "ios" ? "apple" : "stripe";
  if (!user.is_anonymous && user.email_confirmed_at) {
    const seeded = await db().rpc("ensure_trial_wallet", { p_user_id: user.id, p_environment: environment });
    if (seeded.error) throw new GenerationBillingError("Credit service is not available yet.");
  }
  const [wallets, entitlements] = await Promise.all([
    db().from("billing_wallets").select("provider,balance").eq("user_id", user.id).eq("environment", environment).in("provider", [provider, "trial"]),
    db().from("billing_entitlements").select("product_id,expires_at").eq("user_id", user.id).eq("environment", environment).eq("provider", provider).eq("active", true).gt("expires_at", new Date().toISOString()),
  ]);
  if (wallets.error || entitlements.error) throw new GenerationBillingError("Credit service is not available yet.");
  const activePlans = (entitlements.data ?? []).map((row: any) => row.product_id as string);
  const paid = activePlans.length > 0 ? Number(wallets.data?.find((row: any) => row.provider === provider)?.balance ?? 0) : 0;
  const trial = Number(wallets.data?.find((row: any) => row.provider === "trial")?.balance ?? 0);
  return { user, environment, provider, activePlans, paid, trial, owner: isFormAIOwner(user), expiresAt: entitlements.data?.[0]?.expires_at ?? null };
}

async function bodyFingerprint(body: BodyInit | null | undefined) {
  const hash = createHash("sha256");
  if (body instanceof FormData) {
    for (const [name, value] of body.entries()) {
      hash.update(name);
      hash.update(typeof value === "string" ? value : Buffer.from(await value.arrayBuffer()));
    }
  } else if (typeof body === "string") hash.update(body);
  else throw new GenerationBillingError("Unsupported generation payload.");
  return hash.digest("hex");
}

/** Every paid provider call goes through this boundary, including nested analyses. */
export async function meteredFetch(kind: GenerationKind, url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = getRequest();
  if (request.headers.get("x-formai-ai-consent") !== "openai-v2") throw new GenerationBillingError("Please accept AI data sharing before continuing.");
  const root = request.headers.get("x-formai-operation-id");
  if (!root || !uuid.test(root)) throw new GenerationBillingError("Missing generation identity. Reload and try again.");
  const state = await readBillingState(request);
  const allowed = kind === "drawing" || kind === "mesh"
    ? ["pro_monthly", "tool_2d_to_3d_monthly"]
    : ["pro_monthly", "tool_studio_ai_monthly", "tool_model_to_ai_monthly", "tool_ai_edits_monthly", "tool_2d_to_3d_monthly"];
  const paidEligible = state.activePlans.some((plan: string) => allowed.includes(plan));
  const provider = !state.owner && paidEligible && state.paid >= costs[kind] ? state.provider : "trial";
  const counter = counters.get(request) ?? 0;
  counters.set(request, counter + 1);
  const digest = createHash("sha256").update(`${root}:${counter}:${kind}`).digest("hex");
  const operationId = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
  const fingerprint = `${kind}:${await bodyFingerprint(init?.body)}`;
  const reserved = await db().rpc("reserve_generation", { p_user_id: state.user.id, p_operation_id: operationId, p_environment: state.environment, p_provider: provider, p_fingerprint: fingerprint, p_amount: state.owner ? 0 : costs[kind] });
  if (reserved.error) throw new GenerationBillingError("Unable to verify credits. No new generation was started.");
  async function finish(status: "completed" | "refunded" | "uncertain") {
    const result = await db().rpc("finish_generation", { p_user_id: state.user.id, p_operation_id: operationId, p_status: status });
    if (result.error) throw new GenerationBillingError("Generation status needs verification. Do not repeat this request.");
  }
  return executeMeteredOperation(async () => reserved.data, finish, () => fetch(url, init));
}
