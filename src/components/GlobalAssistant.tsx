import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Hammer, LoaderCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAssistantPrefs } from "@/lib/assistant-prefs";

const HIDDEN_ROUTES = ["/"];

export function GlobalAssistant() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { lang, units, setLang, setUnits } = useAssistantPrefs();

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/build-chat" }), []);
  const { messages, sendMessage, status } = useChat({
    id: "global-assistant",
    transport,
    onError: (e) => console.error("global assistant error", e),
  });

  const ctx = useMemo(() => ({ route: pathname, mode: "global-helper", lang, units }), [pathname, lang, units]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, status]);

  if (HIDDEN_ROUTES.includes(pathname)) return null;

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setInput("");
    await sendMessage({ text: t }, { body: { context: ctx } });
  }

  return <>
    {!open && <button
      type="button"
      aria-label="Open AI assistant"
      onClick={() => setOpen(true)}
      className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 active:scale-95"
    >
      <Hammer className="size-6" />
    </button>}

    {open && <div className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-h-[78vh] w-full max-w-[420px] flex-col overflow-hidden rounded-3xl border border-foreground/30 bg-background shadow-2xl sm:right-5 sm:left-auto sm:inset-x-auto">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]">AI Architect · Construction Bible</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">US (IBC/IRC/ADA) + EU (Eurocodes/CTE) codes</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}><X className="size-4" /></Button>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-2">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Lang</span>
          {(["en", "es"] as const).map((l) => <button key={l} type="button" onClick={() => setLang(l)} className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${lang === l ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}>{l === "en" ? "English" : "Español"}</button>)}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Units</span>
          {(["m", "ft"] as const).map((u) => <button key={u} type="button" onClick={() => setUnits(u)} className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${units === u ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}>{u === "m" ? "Meters" : "Feet"}</button>)}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && <div className="space-y-2 text-xs text-muted-foreground">
          <p>Ask me anything about your current tool — I can help you set up the 3D build, suggest dimensions, plan a render, or explain what to upload next.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {["What should I upload here?", "Suggest dimensions for this build", "Help me plan a render"].map((q) => <button
              key={q}
              type="button"
              onClick={() => void send(q)}
              className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium hover:bg-secondary"
            >{q}</button>)}
          </div>
        </div>}
        {messages.map((msg) => <Bubble key={msg.id} msg={msg} />)}
        {(status === "submitted" || status === "streaming") && messages[messages.length - 1]?.role !== "assistant" && <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin" />Thinking…
        </div>}
      </div>

      <form
        className="flex items-end gap-2 border-t border-border px-3 py-2"
        onSubmit={(e) => { e.preventDefault(); void send(input); }}
      >
        <Textarea
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          placeholder="Ask the architect…"
          className="min-h-10 max-h-32 flex-1 resize-none text-xs"
          rows={1}
        />
        <Button type="submit" size="icon" disabled={!input.trim() || status === "submitted" || status === "streaming"}>
          {status === "submitted" || status === "streaming" ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>}
  </>;
}

function Bubble({ msg }: { msg: UIMessage }) {
  const text = msg.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const isUser = msg.role === "user";
  if (!text.trim()) return null;
  return <div className={isUser ? "flex justify-end" : ""}>
    <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${isUser ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}>{text}</div>
  </div>;
}