const MAX_IMAGE_DATA_URL_LENGTH = 3_800_000;
const MAX_TOTAL_IMAGE_DATA_URL_LENGTH = 3_800_000;
const COMPRESSION_STEPS = [
  { maxDimension: 2560, quality: 0.95 },
  { maxDimension: 2048, quality: 0.90 },
  { maxDimension: 1600, quality: 0.82 },
  { maxDimension: 1400, quality: 0.76 },
  { maxDimension: 1200, quality: 0.72 },
  { maxDimension: 1024, quality: 0.68 },
];

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be prepared for upload."));
    image.src = dataUrl;
  });
}

export async function compressImageDataUrl(dataUrl: string, budget: number) {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  if (typeof document === "undefined" || dataUrl.length <= budget)
    return dataUrl;

  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  let best = dataUrl;

  for (const step of COMPRESSION_STEPS) {
    const scale = Math.min(1, step.maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const compressed = canvas.toDataURL("image/jpeg", step.quality);
    if (compressed.length < best.length) best = compressed;
    if (compressed.length <= budget) return compressed;
  }

  return best;
}

export async function streamImage(
  prompt: string,
  sourceImage: string | null,
  onImage: (src: string, isFinal: boolean) => void,
  sourceImages: string[] = [],
) {
  const referenceCount = (sourceImage ? 1 : 0) + sourceImages.length;
  const budget = Math.floor(MAX_IMAGE_DATA_URL_LENGTH / Math.max(1, referenceCount));
  const preparedSourceImage = sourceImage ? await compressImageDataUrl(sourceImage, budget) : null;
  const preparedSourceImages = await Promise.all(
    sourceImages.map((image) => compressImageDataUrl(image, budget)),
  );
  const totalImagePayloadLength = [preparedSourceImage, ...preparedSourceImages].reduce(
    (sum, image) => sum + (image?.length ?? 0),
    0,
  );

  if (totalImagePayloadLength > MAX_TOTAL_IMAGE_DATA_URL_LENGTH) {
    throw new Error(
      "The attached images are too large. Please remove some references or use smaller files.",
    );
  }

  const response = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      sourceImage: preparedSourceImage,
      sourceImages: preparedSourceImages,
    }),
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    const cleanMessage = message.trim().startsWith("<!DOCTYPE html>")
      ? "The rendering service could not process these images. Try smaller or fewer references."
      : message;
    throw new Error(cleanMessage || "The rendering could not be created.");
  }

  if (response.headers.get("content-type")?.includes("application/json")) {
    const result = (await response.json()) as { image?: string };
    if (!result.image) {
      throw new Error("The rendering response did not include an image.");
    }
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
      const eventType = lines
        .find((item) => item.startsWith("event:"))
        ?.slice(6)
        .trim();
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

  if (!completed) {
    throw new Error("The image stream ended before the final render was completed.");
  }
}
