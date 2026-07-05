/**
 * Claude (Anthropic) client for every drawing-analysis and extraction server
 * function. Replaces the Lovable AI gateway.
 *
 * The pipeline's prompts already demand STRICT JSON and are parsed with
 * `parseJsonFromModelText` + zod downstream — this module only handles
 * transport: converting the pipeline's dataURL-based message parts into
 * Anthropic content blocks and running a streaming Messages call (streaming
 * keeps long extractions inside HTTP timeouts).
 */
import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MODEL = "claude-opus-4-8";

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!cachedClient) cachedClient = new Anthropic();
  return cachedClient;
}

/** Message part shapes the existing pipeline builds (OpenAI-style). */
export type GatewayPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename?: string; file_data: string } }
  | Record<string, unknown>;

type ContentBlock = Anthropic.ContentBlockParam;
type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

function asImageMediaType(mediaType: string): ImageMediaType | null {
  return mediaType === "image/png" || mediaType === "image/jpeg" || mediaType === "image/webp" || mediaType === "image/gif"
    ? mediaType
    : null;
}

function splitDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  // Anthropic requires base64 without newlines.
  return { mediaType: match[1], data: match[2].replace(/\s+/g, "") };
}

/** Convert the pipeline's gateway-style parts to Anthropic content blocks. */
export function toClaudeBlocks(parts: GatewayPart[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const part of parts) {
    if (part.type === "text" && typeof (part as { text?: unknown }).text === "string") {
      blocks.push({ type: "text", text: (part as { text: string }).text });
      continue;
    }
    if (part.type === "image_url") {
      const url = (part as { image_url?: { url?: string } }).image_url?.url ?? "";
      const split = splitDataUrl(url);
      const mediaType = split ? asImageMediaType(split.mediaType) : null;
      if (split && mediaType) {
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: split.data },
        });
      }
      continue;
    }
    if (part.type === "file") {
      const fileData = (part as { file?: { file_data?: string } }).file?.file_data ?? "";
      const split = splitDataUrl(fileData);
      const imageMediaType = split ? asImageMediaType(split.mediaType) : null;
      if (split?.mediaType === "application/pdf") {
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: split.data },
        });
      } else if (split && imageMediaType) {
        blocks.push({
          type: "image",
          source: { type: "base64", media_type: imageMediaType, data: split.data },
        });
      }
      continue;
    }
  }
  return blocks;
}

export type ClaudeExtractResult =
  | { ok: true; text: string }
  | { ok: false; error: string; status?: number };

/**
 * One streaming extraction call. Returns the response text, or a user-facing
 * error string matching the tone the app already shows.
 */
export async function claudeExtractJson(options: {
  parts: GatewayPart[];
  system?: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ClaudeExtractResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, error: "The AI service is unavailable — ANTHROPIC_API_KEY is not configured.", status: 401 };
  }

  const blocks = toClaudeBlocks(options.parts);
  if (blocks.length === 0) return { ok: false, error: "Nothing to analyse." };

  try {
    const stream = client.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: options.maxTokens ?? 64000,
        thinking: { type: "adaptive" },
        ...(options.system ? { system: options.system } : {}),
        messages: [{ role: "user", content: blocks }],
      },
      { timeout: options.timeoutMs ?? 1_800_000 },
    );
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      return { ok: false, error: "The drawing could not be analysed.", status: 200 };
    }
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { text: string }).text)
      .join("\n")
      .trim();
    if (!text) return { ok: false, error: "The AI did not return a description." };
    return { ok: true, text };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, error: "The studio is busy. Please retry shortly.", status: 429 };
    }
    if (error instanceof Anthropic.APIError && typeof error.status === "number") {
      if (error.status === 401 || error.status === 403) {
        return { ok: false, error: "The AI service is unavailable.", status: error.status };
      }
      if (error.status === 400 && /credit/i.test(error.message)) {
        return { ok: false, error: "AI credits are exhausted.", status: 402 };
      }
      console.error("[claude] API error", error.status, error.message.slice(0, 300));
      return { ok: false, error: "The drawing could not be analysed.", status: error.status };
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return { ok: false, error: "The AI service could not be reached. Please retry.", status: 503 };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[claude] unexpected error", message.slice(0, 300));
    return { ok: false, error: "The drawing could not be analysed." };
  }
}
