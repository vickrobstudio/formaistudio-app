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

const gateway = "https://connector-gateway.lovable.dev/replicate/v1";

export const generateFurniture3D = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateFurniture3DInput.parse(input))
  .handler(async ({ data, context }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const replicateKey = process.env.REPLICATE_API_KEY;
    if (!lovableKey || !replicateKey) throw new Error("The 3D generation connection is unavailable.");

    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": replicateKey,
      "Content-Type": "application/json",
      Prefer: "wait=60",
    };
    const created = await fetch(`${gateway}/models/tencent/hunyuan-3d-3.1/predictions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { image: data.imageDataUrl, enable_pbr: true, face_count: 500000, generate_type: "Normal" } }),
    });
    if (!created.ok) {
      const detail = await created.text();
      console.error("3D prediction failed", created.status, detail);
      if (created.status === 402) {
        throw new Error("The 3D generation service is out of credit. Please top up your Replicate account and try again.");
      }
      throw new Error("The furniture could not be converted to 3D.");
    }

    let prediction = await created.json() as Prediction;
    for (let attempt = 0; prediction.status === "starting" || prediction.status === "processing"; attempt += 1) {
      if (!prediction.id || attempt >= 36) throw new Error("The 3D model is taking longer than expected. Please retry.");
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const polled = await fetch(`${gateway}/predictions/${prediction.id}`, { headers });
      if (!polled.ok) throw new Error("The 3D model status could not be checked.");
      prediction = await polled.json() as Prediction;
    }
    if (prediction.status !== "succeeded" || !prediction.output) {
      console.error("3D prediction ended", prediction.status, prediction.error);
      throw new Error("The furniture could not be converted to 3D.");
    }

    const modelResponse = await fetch(prediction.output);
    if (!modelResponse.ok) throw new Error("The generated 3D model could not be downloaded.");
    const modelBytes = new Uint8Array(await modelResponse.arrayBuffer());
    const modelPath = `${context.userId}/furniture/${crypto.randomUUID()}.glb`;
    const { error: uploadError } = await context.supabase.storage.from("user-outputs").upload(modelPath, modelBytes, { contentType: "model/gltf-binary", upsert: false });
    if (uploadError) throw new Error("The 3D model could not be saved to your Cloud.");
    const { data: signed, error: signedError } = await context.supabase.storage.from("user-outputs").createSignedUrl(modelPath, 3_600);
    if (signedError) throw new Error("The 3D model preview could not be opened.");
    return { modelPath, modelUrl: signed.signedUrl };
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