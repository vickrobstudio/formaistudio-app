import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

export const Route = createFileRoute("/api/photo-chat")({
  server: { handlers: { POST: async ({ request }) => {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 15 * 1024 * 1024) return new Response("Image is too large", { status: 413 });
    const body = await request.json().catch(() => null) as { messages?: unknown } | null;
    if (!body || !Array.isArray(body.messages) || body.messages.length > 100) return new Response("Messages are required", { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) return new Response("Photo AI is unavailable.", { status: 500 });
    const { anthropic } = await import("@ai-sdk/anthropic");
    const result = streamText({
      model: anthropic("claude-opus-4-8"),
      system: "You are Photo AI, a concise expert interior design and image-editing assistant. Analyze every attached room or object image. Help users add, remove, replace and edit objects, materials, finishes, context and illumination while preserving perspective. When a user asks for a visual change, respond with a precise production-ready image-edit instruction and briefly explain what will be preserved. If no image is attached, rely only on the user's description.",
      messages: await convertToModelMessages(body.messages as UIMessage[]),
    });
    return result.toUIMessageStreamResponse({ originalMessages: body.messages as UIMessage[] });
  } } },
});