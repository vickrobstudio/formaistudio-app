import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const Route = createFileRoute("/api/photo-chat")({
  server: { handlers: { POST: async ({ request }) => {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 15 * 1024 * 1024) return new Response("Image is too large", { status: 413 });
    const body = await request.json().catch(() => null) as { messages?: unknown } | null;
    if (!body || !Array.isArray(body.messages) || body.messages.length > 100) return new Response("Messages are required", { status: 400 });
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return new Response("Photo AI is unavailable.", { status: 500 });
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const result = streamText({
      model: createLovableAiGatewayProvider(key)("google/gemini-3-flash-preview"),
      system: "You are Photo AI, a concise expert interior design assistant. Analyze attached room images when provided, and help users understand, redesign, furnish, light, and improve their spaces. Give practical, tasteful guidance. If no image is attached, rely only on the user's description.",
      messages: await convertToModelMessages(body.messages as UIMessage[]),
    });
    return result.toUIMessageStreamResponse({ originalMessages: body.messages as UIMessage[] });
  } } },
});