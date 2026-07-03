import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GenerateFurniture3DInput = z.object({
  imageDataUrl: z.string().startsWith("data:image/").max(8_000_000),
});

type Prediction = {
  id?: string;
  status?: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string;
  error?: string;
};

type GenerateFurniture3DResult =
  | { ok: true; modelPath: string; modelUrl: string }
  | { ok: false; error: string };

const gateway = "https://connector-gateway.lovable.dev/replicate/v1";

export const generateFurniture3D = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateFurniture3DInput.parse(input))
  .handler(async ({ data, context }): Promise<GenerateFurniture3DResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const replicateKey = process.env.REPLICATE_API_KEY;
    if (!lovableKey || !replicateKey) return { ok: false, error: "The 3D generation connection is unavailable." };

    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": replicateKey,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    };
    let created: Response | null = null;
    let createDetail = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      created = await fetch(`${gateway}/models/tencent/hunyuan-3d-3.1/predictions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ input: { image: data.imageDataUrl, enable_pbr: true, face_count: 500000, generate_type: "Normal" } }),
      });
      if (created.ok) break;
      createDetail = await created.text();
      console.error("3D prediction failed", created.status, createDetail);
      if (created.status === 402) {
        return { ok: false, error: "The 3D generation service needs more credit before it can create another model." };
      }
      if (created.status !== 502 && created.status !== 503 && created.status !== 504) break;
      await new Promise((resolve) => setTimeout(resolve, 3_000 * (attempt + 1)));
    }
    if (!created || !created.ok) {
      return { ok: false, error: "The 3D generation service is temporarily unavailable. Please try again in a moment." };
    }

    let prediction = await created.json() as Prediction;
    let pollFailures = 0;
    for (let attempt = 0; prediction.status === "starting" || prediction.status === "processing"; attempt += 1) {
      if (!prediction.id || attempt >= 72) return { ok: false, error: "The 3D model is taking longer than expected. Please retry." };
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const polled = await fetch(`${gateway}/predictions/${prediction.id}`, { headers });
      if (!polled.ok) {
        pollFailures += 1;
        if (pollFailures >= 3) return { ok: false, error: "The 3D model status could not be checked." };
        continue;
      }
      pollFailures = 0;
      prediction = await polled.json() as Prediction;
    }
    if (prediction.status !== "succeeded" || !prediction.output) {
      console.error("3D prediction ended", prediction.status, prediction.error);
      return { ok: false, error: "The furniture could not be converted to 3D." };
    }

    const modelResponse = await fetch(prediction.output);
    if (!modelResponse.ok) return { ok: false, error: "The generated 3D model could not be downloaded." };
    const modelBytes = new Uint8Array(await modelResponse.arrayBuffer());
    const modelPath = `${context.userId}/furniture/${crypto.randomUUID()}.glb`;
    const { error: uploadError } = await context.supabase.storage.from("user-outputs").upload(modelPath, modelBytes, { contentType: "model/gltf-binary", upsert: false });
    if (uploadError) return { ok: false, error: "The 3D model could not be saved to your Cloud." };
    const { data: signed, error: signedError } = await context.supabase.storage.from("user-outputs").createSignedUrl(modelPath, 3_600);
    if (signedError) return { ok: false, error: "The 3D model preview could not be opened." };
    return { ok: true, modelPath, modelUrl: signed.signedUrl };
  });

const SignModelInput = z.object({ path: z.string().min(1).max(500) });

export const getFurnitureModelDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SignModelInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("This model is not in your library.");
    const { data: signed, error } = await context.supabase.storage.from("user-outputs").createSignedUrl(data.path, 300, { download: true });
    if (error) throw new Error("The model download could not be prepared.");
    return { url: signed.signedUrl };
  });