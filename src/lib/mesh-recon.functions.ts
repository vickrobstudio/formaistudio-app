import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Real image-to-3D mesh reconstruction via Replicate (Trellis).
 *
 * Trellis returns a textured GLB that is a true mesh reconstruction of the
 * approved rendering — not a primitive approximation. Predictions take
 * 1–5 minutes, so we expose a start/poll pair instead of a single blocking
 * server fn (Workers have short request budgets).
 */

const GATEWAY = "https://connector-gateway.lovable.dev/replicate/v1";

function authHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const rep = process.env.REPLICATE_API_KEY ?? process.env.LOVABLE_CONNECTOR_REPLICATE_API_KEY;
  if (!lov || !rep) throw new Error("Replicate connector is not linked to this project.");
  return {
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": rep,
  } as const;
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string; mime: string } {
  const match = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data URL.");
  const mime = match[1];
  const ext = match[2] === "jpeg" ? "jpg" : match[2];
  const bin = atob(match[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: mime }), ext, mime };
}

async function uploadImageToReplicate(imageDataUrl: string): Promise<string> {
  const { blob, ext } = dataUrlToBlob(imageDataUrl);
  const form = new FormData();
  form.append("content", blob, `render.${ext}`);
  const res = await fetch(`${GATEWAY}/files`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error(`Replicate upload failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { urls?: { get?: string } };
  const url = json.urls?.get;
  if (!url) throw new Error("Replicate upload did not return a file URL.");
  return url;
}

// Community Trellis model — must be invoked via /v1/predictions with version
// hash. Update if firtoz publishes a new version.
const TRELLIS_VERSION = "e8f6c45206993f297372f5436b90350817bd9b4a0d52d2a76df50c1c8afa2b3c";

export const startMeshReconstruction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        imageDataUrl: z
          .string()
          .regex(/^data:image\/(png|jpeg|webp);base64,/)
          .max(50_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const imageUrl = await uploadImageToReplicate(data.imageDataUrl);
      const res = await fetch(`${GATEWAY}/predictions`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          version: TRELLIS_VERSION,
          input: {
            images: [imageUrl],
            texture_size: 1024,
            mesh_simplify: 0.95,
            generate_color: true,
            generate_model: true,
            generate_normal: true,
            randomize_seed: true,
            save_gaussian_ply: false,
            ss_sampling_steps: 38,
            slat_sampling_steps: 12,
            ss_guidance_strength: 7.5,
            slat_guidance_strength: 3,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 402) {
          return {
            ok: false as const,
            error: "Your Replicate account is out of credit. Add credit at replicate.com/account/billing, wait ~2 minutes, then retry.",
          };
        }
        if (res.status === 401 || res.status === 403) {
          return {
            ok: false as const,
            error: "Replicate rejected the API key. Re-link the Replicate connector and try again.",
          };
        }
        return { ok: false as const, error: `Replicate rejected the request (${res.status}): ${body.slice(0, 200)}` };
      }
      const json = (await res.json()) as { id?: string };
      if (!json.id) return { ok: false as const, error: "Replicate did not return a prediction id." };
      return { ok: true as const, predictionId: json.id };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Mesh reconstruction failed to start." };
    }
  });

function pickGlbUrl(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === "string" && output.endsWith(".glb")) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const u = pickGlbUrl(item);
      if (u) return u;
    }
    return null;
  }
  if (typeof output === "object") {
    const rec = output as Record<string, unknown>;
    for (const key of ["model_file", "glb", "mesh", "model"]) {
      const v = rec[key];
      if (typeof v === "string" && v.endsWith(".glb")) return v;
    }
    for (const v of Object.values(rec)) {
      const u = pickGlbUrl(v);
      if (u) return u;
    }
  }
  return null;
}

export const pollMeshReconstruction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        predictionId: z.string().min(1).max(200),
        outputUnits: z.enum(["meters", "feet"]).default("meters").optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${GATEWAY}/predictions/${encodeURIComponent(data.predictionId)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        return { ok: false as const, error: `Replicate poll failed (${res.status}).` };
      }
      const json = (await res.json()) as { status?: string; output?: unknown; error?: unknown };
      const status = json.status ?? "unknown";
      if (status === "failed" || status === "canceled") {
        return { ok: false as const, error: typeof json.error === "string" ? json.error : `Reconstruction ${status}.` };
      }
      if (status !== "succeeded") {
        return { ok: true as const, status, glbDataUrl: null, daeDataUrl: null };
      }
      const glbUrl = pickGlbUrl(json.output);
      if (!glbUrl) return { ok: false as const, error: "Reconstruction finished but no .glb file was produced." };
      const fileRes = await fetch(glbUrl);
      if (!fileRes.ok) return { ok: false as const, error: `Could not fetch mesh (${fileRes.status}).` };
      const buf = new Uint8Array(await fileRes.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const base64 = btoa(binary);
      // Convert the SAME mesh to a Collada .dae so the downloadable file is a
      // true 1:1 representation of the reconstructed render — not a primitive
      // approximation.
      let daeDataUrl: string | null = null;
      try {
        const { glbToDae } = await import("./glb-to-dae.server");
        const dae = glbToDae(buf, { units: data.outputUnits ?? "meters" });
        const daeB64 = Buffer.from(dae, "utf8").toString("base64");
        daeDataUrl = `data:model/vnd.collada+xml;base64,${daeB64}`;
      } catch (err) {
        console.error("glb->dae conversion failed", err);
      }
      return {
        ok: true as const,
        status: "succeeded",
        glbDataUrl: `data:model/gltf-binary;base64,${base64}`,
        daeDataUrl,
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Polling failed." };
    }
  });