import { meteredFetch } from "./generation-billing.server";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// This module is only loaded by server handlers. Never use a VITE_ key.
export function createOpenAIChatModel(key: string) {
  const openai = createOpenAICompatible({
    name: "openai",
    fetch: (url, init) => meteredFetch("assistant", url, init),
    baseURL: "https://api.openai.com/v1",
    headers: { Authorization: `Bearer ${key}` },
  });
  return openai(process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4.1");
}
