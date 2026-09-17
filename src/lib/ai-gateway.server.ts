import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createGeminiProvider(key: string) {
  return createOpenAICompatible({
    name: "gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    headers: { Authorization: `Bearer ${key}` },
  });
}
