export async function streamImage(
  prompt: string,
  sourceImage: string | null,
  onImage: (src: string, isFinal: boolean) => void,
  sourceImages: string[] = [],
) {
  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, sourceImage, sourceImages }),
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(message || "The rendering could not be created.");
  }

  if (response.headers.get("content-type")?.includes("application/json")) {
    const result = (await response.json()) as { image?: string };
    if (!result.image) throw new Error("The rendering response did not include an image.");
    onImage(result.image, true);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const lines = event.split(/\r?\n/);
      const eventType = lines.find((item) => item.startsWith("event:"))?.slice(6).trim();
      const line = lines.find((item) => item.startsWith("data:"));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as {
          b64_json?: string;
          partial_image_b64?: string;
          type?: string;
        };
        const image = parsed.b64_json ?? parsed.partial_image_b64;
        const type = eventType ?? parsed.type;
        const isFinal = type === "image_generation.completed";
        if (image) onImage(`data:image/png;base64,${image}`, isFinal);
        if (isFinal) completed = true;
      } catch {
        // Ignore non-image progress events.
      }
    }
  }

  if (!completed) throw new Error("The image stream ended before the final render was completed.");
}