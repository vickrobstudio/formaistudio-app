import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RenderInput = z.object({
  prompt: z.string().trim().min(10).max(1800),
});

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const result = RenderInput.safeParse(await request.json().catch(() => null));
        if (!result.success) return new Response("Describe the room in a little more detail.", { status: 400 });

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Rendering service is unavailable.", { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-image-2",
            prompt: `${result.data.prompt}. Photorealistic luxury interior visualization, sculptural contemporary European furniture, refined materials, editorial architectural lighting, no text, no logos.`,
            quality: "low",
            size: "1536x1024",
            stream: true,
            partial_images: 1,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const status = upstream.status === 402 ? 402 : upstream.status === 429 ? 429 : 502;
          const message = status === 402 ? "AI credits are exhausted." : status === 429 ? "The studio is busy. Please retry shortly." : "The rendering could not be created.";
          return new Response(message, { status });
        }

        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});