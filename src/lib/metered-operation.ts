export class GenerationBillingError extends Error {}

export async function executeMeteredOperation(
  reserve: () => Promise<string>,
  finish: (status: "completed" | "refunded" | "uncertain") => Promise<void>,
  invoke: () => Promise<Response>,
): Promise<Response> {
  const status = await reserve();
  if (status !== "accepted") {
    const messages: Record<string,string> = {
      insufficient_credits: "You have no credits for this tool. Open your Wallet to continue.",
      subscription_required: "An active subscription is required for this tool.",
      daily_limit: "The daily generation limit has been reached. Please contact support.",
      rate_limit: "Too many requests. Please wait before generating again.",
      busy: "Another generation is still being checked. Please wait.",
    };
    throw new GenerationBillingError(messages[status] ?? "This request was already received. No duplicate generation was started.");
  }
  let response: Response;
  try { response = await invoke(); }
  catch (error) { await finish("uncertain"); throw error; }
  await finish(response.ok ? "completed" : [400,401,402,403,404,422,429].includes(response.status) ? "refunded" : "uncertain");
  return response;
}
