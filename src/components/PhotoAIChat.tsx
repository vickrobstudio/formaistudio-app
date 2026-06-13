import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { LoaderCircle, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GUEST_PHOTO_CHAT_KEY } from "@/lib/guest-trial";
import { supabase } from "@/integrations/supabase/client";

const transport = new DefaultChatTransport({ api: "/api/photo-chat" });

function messageText(message: UIMessage) {
  return message.parts.map((part) => part.type === "text" ? part.text : "").join("");
}

export function PhotoAIChat() {
  const [input, setInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) {
        const { data: rows } = await supabase.from("photo_ai_messages").select("id, role, content").eq("user_id", id).order("created_at");
        setInitialMessages((rows ?? []).map((row) => ({ id: row.id, role: row.role as "user" | "assistant", parts: [{ type: "text", text: row.content }] })));
      } else {
        const stored = window.localStorage.getItem(GUEST_PHOTO_CHAT_KEY);
        setInitialMessages(stored ? JSON.parse(stored) as UIMessage[] : []);
      }
    })();
  }, []);

  if (initialMessages === null) return <main className="grid min-h-screen place-items-center bg-background"><LoaderCircle className="animate-spin" /></main>;
  return <PhotoAIConversation key={userId ?? "guest"} userId={userId} initialMessages={initialMessages} input={input} setInput={setInput} />;
}

function PhotoAIConversation({ userId, initialMessages, input, setInput }: { userId: string | null; initialMessages: UIMessage[]; input: string; setInput: (value: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const persistedRef = useRef(new Set(initialMessages.map((message) => message.id)));
  const { messages, sendMessage, setMessages, status, error } = useChat({ id: userId ?? "guest-photo-ai", messages: initialMessages, transport });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, status]);
  useEffect(() => { if (!busy) inputRef.current?.focus(); }, [busy]);
  useEffect(() => {
    if (busy) return;
    if (!userId) { window.localStorage.setItem(GUEST_PHOTO_CHAT_KEY, JSON.stringify(messages)); return; }
    const unsaved = messages.filter((message) => !persistedRef.current.has(message.id)).map((message) => ({ user_id: userId, role: message.role, content: messageText(message) })).filter((message) => message.content);
    if (unsaved.length === 0) return;
    void supabase.from("photo_ai_messages").insert(unsaved).then(({ error: saveError }) => { if (!saveError) messages.forEach((message) => persistedRef.current.add(message.id)); });
  }, [busy, messages, userId]);

  async function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
  }

  async function clear() {
    setMessages([]);
    persistedRef.current.clear();
    if (userId) await supabase.from("photo_ai_messages").delete().eq("user_id", userId);
    else window.localStorage.removeItem(GUEST_PHOTO_CHAT_KEY);
    inputRef.current?.focus();
  }

  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink /></div><PageIntro eyebrow="Always free" title="Photo AI chat" description={userId ? "Your single conversation is saved to your account." : "Chat free as a guest. Sign up later to save your conversation."} /><section className="px-5 pb-[calc(11rem+env(safe-area-inset-bottom))]"><div className="space-y-4">{messages.length === 0 && <p className="border-y border-border py-8 text-center text-sm text-muted-foreground">Ask about your room, furniture, lighting, layout or style.</p>}{messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-foreground text-background" : "bg-secondary text-foreground"}`}>{messageText(message)}</div>)}{status === "submitted" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Photo AI is thinking…</div>}{error && <p role="alert" className="text-xs text-destructive">{error.message}</p>}<div ref={endRef} /></div></section><div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background p-3"><div className="mx-auto flex max-w-xl items-end gap-2"><Button variant="ghost" size="icon" aria-label="Clear conversation" onClick={clear}><Trash2 /></Button><Textarea ref={inputRef} autoFocus value={input} maxLength={2000} rows={1} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Ask Photo AI…" className="min-h-11 resize-none rounded-2xl" /><Button size="icon" aria-label="Send message" disabled={busy || !input.trim()} onClick={() => void submit()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}</Button></div></div><ToolTabBar /></main>;
}