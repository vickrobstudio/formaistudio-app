import type { UIMessage } from "ai";

type ChatStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readGuestChat(getStorage: () => ChatStorage, key: string): UIMessage[] {
  try {
    const raw = getStorage().getItem(key);
    const value: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(value)) return [];
    return value.filter((message): message is UIMessage =>
      !!message && typeof message === "object" &&
      typeof message.id === "string" &&
      ["user", "assistant", "system"].includes(message.role) &&
      Array.isArray(message.parts) &&
      message.parts.every((part: unknown) => !!part && typeof part === "object" && "type" in part && (
        part.type === "text" ? "text" in part && typeof part.text === "string" :
        part.type === "file" ? "url" in part && typeof part.url === "string" && "mediaType" in part && typeof part.mediaType === "string" :
        typeof part.type === "string"
      ))
    );
  } catch {
    return [];
  }
}

export function saveGuestChat(getStorage: () => ChatStorage, key: string, messages: UIMessage[]): "full" | "text-only" | "unavailable" {
  try {
    getStorage().setItem(key, JSON.stringify(messages));
    return "full";
  } catch {
    // Keep attachments in the live conversation; only shrink the saved copy.
    try {
      const textOnly = messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts.flatMap((part) =>
          part.type === "text" ? [{ type: "text" as const, text: part.text }] : []
        ),
      })).filter((message) => message.parts.length > 0);
      getStorage().setItem(key, JSON.stringify(textOnly));
      return "text-only";
    } catch {
      return "unavailable";
    }
  }
}

export function clearGuestChat(getStorage: () => ChatStorage, key: string): boolean {
  try {
    getStorage().removeItem(key);
    return true;
  } catch {
    return false;
  }
}
