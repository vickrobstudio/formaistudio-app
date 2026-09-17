import { meteredFetch, GenerationBillingError } from "./generation-billing.server";
import { Buffer } from "node:buffer";

export async function renderOpenAIImage(
  prompt: string,
  references: string[],
  signal?: AbortSignal,
): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return new Response("Rendering service is unavailable.", { status: 503 });
  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-sunburst";
  const options = {
    model, prompt, n: 1, quality: "max", size: "auto",
    output_format: "jpeg", output_compression: 100,
  };
  let body: string | FormData;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  const endpoint = references.length ? "edits" : "generations";
  if (references.length) {
    const form = new FormData();
    for (const [name, value] of Object.entries(options)) form.append(name, String(value));
    for (const [index, reference] of references.entries()) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(reference);
      if (!match) return new Response("Use PNG, JPEG or WebP reference images.", { status: 400 });
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length) return new Response("A reference image is empty.", { status: 400 });
      form.append("image[]", new Blob([bytes], { type: match[1] }), `reference-${index}.${match[1].split("/")[1]}`);
    }
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options);
  }

  try {
    const upstream = await meteredFetch("image", `https://api.openai.com/v1/images/${endpoint}`, {
      method: "POST", headers, body,
      signal: AbortSignal.any([AbortSignal.timeout(240_000), ...(signal ? [signal] : [])]),
    });
    const payload = await upstream.json().catch(() => null) as {
      data?: Array<{ b64_json?: string }>;
      error?: { code?: string; type?: string };
    } | null;
    if (!upstream.ok) {
      const code = payload?.error?.code;
      console.error("OpenAI image request failed", {
        status: upstream.status, code, model,
        requestId: upstream.headers.get("x-request-id"),
      });
      if (code === "insufficient_quota") return new Response("Image generation quota is unavailable. Please contact support.", { status: 503 });
      if (upstream.status === 429) return new Response("The studio is busy. Please retry shortly.", { status: 429 });
      if (upstream.status === 401 || upstream.status === 403 || code === "model_not_found") {
        return new Response("Image generation is not enabled for this service yet. Please contact support.", { status: 503 });
      }
      if (code === "moderation_blocked" || payload?.error?.type === "image_generation_user_error") {
        return new Response("This image request could not be processed. Try a different description or reference.", { status: 400 });
      }
      return new Response("The rendering could not be created. Please try again.", { status: 502 });
    }
    const base64 = payload?.data?.[0]?.b64_json;
    if (!base64) return new Response("The rendering response did not include an image.", { status: 502 });
    return Response.json({ image: `data:image/jpeg;base64,${base64}` });
  } catch (error) {
    if (error instanceof GenerationBillingError) return new Response(error.message, { status: 402 });
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("OpenAI image request interrupted", { name, model });
    return new Response(
      name === "TimeoutError" ? "Rendering took too long. Please try again." : "Rendering was interrupted. Please try again.",
      { status: name === "TimeoutError" ? 504 : 502 },
    );
  }
}
