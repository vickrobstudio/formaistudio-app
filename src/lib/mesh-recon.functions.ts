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

const GATEWAY = "https://api.replicate.com/v1";

function authHeaders() {
  const token = process.env.REPLICATE_API_TOKEN ?? process.env.REPLICATE_API_KEY;
  if (!token) throw new Error("Replicate is not configured — set REPLICATE_API_TOKEN.");
  return {
    Authorization: `Bearer ${token}`,
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
  const { authorizeAIUpload } = await import("./generation-billing.server");
  await authorizeAIUpload();
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
        quality: z.enum(["low", "high"]).default("high").optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const imageUrl = await uploadImageToReplicate(data.imageDataUrl);
      const isHigh = (data.quality ?? "high") === "high";
      const { meteredFetch } = await import("./generation-billing.server");
      const res = await meteredFetch("mesh", `${GATEWAY}/predictions`, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          version: TRELLIS_VERSION,
          input: {
            images: [imageUrl],
            // High poly = larger texture, far less aggressive simplification
            // so the mesh keeps fine geometric detail. Low poly stays light
            // for fast loading and game-engine use.
            texture_size: isHigh ? 2048 : 1024,
            mesh_simplify: isHigh ? 0.9 : 0.98,
            generate_color: true,
            generate_model: true,
            generate_normal: true,
            randomize_seed: true,
            save_gaussian_ply: false,
            ss_sampling_steps: isHigh ? 50 : 38,
            slat_sampling_steps: isHigh ? 18 : 12,
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
      const { registerPrediction } = await import("./generation-billing.server");
      await registerPrediction(json.id);
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
        targetBoundsMeters: z
          .object({
            width: z.number().positive().max(1000),
            depth: z.number().positive().max(1000),
            height: z.number().positive().max(1000),
          })
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { authorizePrediction } = await import("./generation-billing.server");
      await authorizePrediction(data.predictionId);
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
        return { ok: true as const, status, glbDataUrl: null, daeDataUrl: null, objDataUrl: null, fbxDataUrl: null };
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
      let objDataUrl: string | null = null;
      let fbxDataUrl: string | null = null;
      try {
        const { glbToDae } = await import("./glb-to-dae.server");
        const dae = glbToDae(buf, {
          units: data.outputUnits ?? "meters",
          targetBoundsMeters: data.targetBoundsMeters,
        });
        const daeB64 = Buffer.from(dae, "utf8").toString("base64");
        daeDataUrl = `data:model/vnd.collada+xml;base64,${daeB64}`;
        const { parseDaeToTriangles } = await import("./dae-to-triangles.server");
        const { trianglesToObj, trianglesToFbxAscii, toDataUrl } = await import("./mesh-export.server");
        const groups = parseDaeToTriangles(dae);
        const { obj } = trianglesToObj(groups);
        objDataUrl = toDataUrl(obj, "model/obj");
        fbxDataUrl = toDataUrl(trianglesToFbxAscii(groups, data.outputUnits ?? "meters", "Y"), "application/octet-stream");
      } catch (err) {
        console.error("glb->dae conversion failed", err);
      }
      return {
        ok: true as const,
        status: "succeeded",
        glbDataUrl: `data:model/gltf-binary;base64,${base64}`,
        daeDataUrl,
        objDataUrl,
        fbxDataUrl,
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Polling failed." };
    }
  });
