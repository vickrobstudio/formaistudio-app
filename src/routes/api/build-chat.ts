import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const Route = createFileRoute("/api/build-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > 30 * 1024 * 1024) return new Response("Payload too large", { status: 413 });
        const body = (await request.json().catch(() => null)) as { messages?: unknown; context?: unknown } | null;
        if (!body || !Array.isArray(body.messages) || body.messages.length > 80) {
          return new Response("Messages are required", { status: 400 });
        }
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("AI is unavailable.", { status: 500 });
        const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");

        const ctx = (body.context ?? {}) as Record<string, unknown>;
        const ctxJson = JSON.stringify(ctx).slice(0, 6000);

        const system = `You are the FormAI Build Architect — an interactive assistant that co-designs a 3D building model with the user from their uploaded 2D plans.

RULES:
• Ask ONE concise question at a time. Confirm BEFORE assuming any dimension.
• Always work in metres. Use Apple-clean, friendly tone. Under 3 short sentences per turn.
• When you propose ANY dimension, roof shape, or per-floor change, emit a single fenced JSON block exactly like this so the UI can render an Accept / Reject card:
\n\`\`\`proposal
{ "summary": "Short human label", "patch": { "wallHeightM"?: number, "ceilingHeightM"?: number, "parapetHeightM"?: number, "roofType"?: "flat"|"gable"|"hip"|"shed", "roofPitchDeg"?: number, "roofHeightM"?: number, "ridgeDirection"?: "NS"|"EW", "floors"?: [{ "index": number, "heightM"?: number, "label"?: string }] } }
\`\`\`\n
• Only emit ONE proposal block per message. After the proposal, ask if the user wants to accept or tweak it.
• Auto-detect first: read attached floor plan / elevation / roof plan images and propose sensible values inferred from the drawings. If a drawing shows printed dimensions, use them. Otherwise use residential defaults (wall 2.70 m, ceiling = wall, gable pitch 30°, hip pitch 25°, shed pitch 10°, flat parapet 0.4 m).
• Walk the user through: 1) per-floor wall heights, 2) ceiling height, 3) roof shape (flat / gable / hip / shed), 4) roof pitch or roof-height, 5) ridge direction for gable/shed, 6) parapet for flat. Skip any step the user already locked.
• Never invent files. Only reference floors / roof plans / elevations actually attached.

CURRENT PROJECT STATE (JSON):
${ctxJson}`;

        const result = streamText({
          model: createLovableAiGatewayProvider(key)("google/gemini-3-flash-preview"),
          system,
          messages: await convertToModelMessages(body.messages as UIMessage[]),
        });
        return result.toUIMessageStreamResponse({ originalMessages: body.messages as UIMessage[] });
      },
    },
  },
});