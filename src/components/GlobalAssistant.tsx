import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAssistantPrefs } from "@/lib/assistant-prefs";

// Hidden on the landing page and on pages that already ARE a chat.
const HIDDEN_ROUTES = ["/", "/photo-to-ai"];

export function GlobalAssistant() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { lang, units, region, setLang, setUnits } = useAssistantPrefs();

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/build-chat" }), []);
  const { messages, sendMessage, status } = useChat({
    id: "global-assistant",
    transport,
    onError: (e) => console.error("global assistant error", e),
  });

  const ctx = useMemo(() => ({ route: pathname, mode: "global-helper", lang, units, region }), [pathname, lang, units, region]);

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
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-black text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
    >
      <svg viewBox="0 0 1148.7 898.45" aria-hidden="true" className="size-8" fill="currentColor">
        <path d="M663.01,832.11l-62.45,29.23c-23.66,11.07-46.96,20.94-72,28.42-22.48,6.72-44.7,8.63-68.63,8.68-96.68.21-192.15-14.96-284.18-44.78-59.07-19.14-208.78-79.19-169.17-153.54,7-13.13,16.17-24.21,26.75-34.91l59.77-60.4,27.13-26.74.84-81.06,2.56-23.35,39.28-27.08c10.45-110.34,48.66-221.52,126.11-302.51,21.04-22,43.66-41.01,71.35-53.11,10.67-4.66,19.46-9.19,29.2-15.99C458.16,27.07,539.14-.32,622.95,0c48.5.19,95.08,10.38,137.41,33.15,14.13,7.6,26.01,16.39,39.64,25.27,41.13,5.9,78.63,25.09,109.07,53.77l21.72,20.47c10.73,10.11,22.78,19.93,29.28,33.4,4.03,8.35,8.99,12.51,15.86,18.21,71.4,59.21,110.49,171.71,114.59,263.38l1.91,42.61c.14,3.08,2.28,7.13,4.64,8.84l23.62,17.12c19.14,13.87,28.69,58.88,27.96,82.15-2.13,67.65-83.85,76.92-136.98,88.71l-51.56,11.44-297.11,133.59ZM230.4,595.7l3.28-77.07c4.39-55.65,12.86-110.01,26.93-164.18,20.11-77.45,52.45-148.95,105.39-208.67,13.95-14.67,27.12-28.37,41.94-42.07,53.21-49.2,119.14-78.73,190.45-85.74-6.1-1.04-11.11-.49-17.27.35-51.6,6.96-100.55,24.1-146.23,49.1-37.53,20.54-68.62,47.66-97.19,79.32-113.36,125.64-136.14,268.63-135.2,434.87l27.9,14.1ZM417.49,548.24c5.49-124.94,41.38-249.29,116.12-348.46,60.26-79.96,157.24-150.94,261.37-142.08-7.47-4.39-15.87-7.12-24.87-7.48-62.79-2.5-125.7,20.44-177.78,55.36-68.04,45.61-120.05,109.13-153.08,184.63-48.09,109.94-60.31,233.31-52.7,352.55l32.3,4.19-1.72-25.99.35-72.72ZM702.35,207.06c21.66-20.19,44.38-36.98,71.37-48.82,53.65-24.13,111.55-22.04,166.02,1.06-49.42-31.75-110.58-39.67-166.62-24.51-35.67,10.3-66.35,28.53-94.39,52.51-70.48,63.85-117.47,153.32-134.87,246.68,9.73,6.62,20.89,8.22,30.81,2.52,22.96-83.05,65.86-169.22,127.69-229.43ZM1038.22,579.79c12.08-1.66,20.75-6.7,30.81-10.66,6.03-2.87,10.66-8.03,11.55-15.24,7.67-62.02,3.21-124.15-13.52-184.29-6.35-19.15-11.65-37.47-22.25-54.29,28.12,78.25,34.42,158.46,26.53,240.61-.31,3.24-4.64,8.19-6.59,9.99l-26.53,13.88ZM998.25,553.4l26.18-4.86-11.38-10.98c-4.25-4.1-12.85-7.94-19.17-6.22l-96.41,26.33c-20.6,5.63-34.52,21.3-44.83,39.09l-16.9,29.15c-6.16,10.62-17.1,15.41-28.54,18.11-37.16,8.74-73.94,15.14-111.72,20.26-8.05,1.09-12.82-4.99-14.02-12.4l-8.97-55.26c-1.61-9.92-8.8-15.42-18.83-15.56-35.97-.52-70.94-.17-106.97,2.16-5.58.36-10.51,8.22-12.08,13.07l-19.28,59.32c-2.14,6.59-7.78,12.76-15.22,12.48-28.79-1.06-56.63-2.13-85.62-5.54-55.63-6.55-109.18-18.98-162.2-36.91-22.71-7.68-43.38-17.05-64.48-27.72-7.54-3.81-10.91-10.48-11.1-19.14l-2.23-103.29c-6.47-7.46-12.6-13.28-20.09-18.61l-27.36,20.14,23.47,27.82c1.5,1.78,3.43,6.5,3.61,9.09l5.55,80.04c.41,5.93,4.48,10.17,9.36,13.19,22.98,14.24,46.81,24.73,72.63,33.49,94.78,32.15,177.38,40.79,276.73,43.18,4.71.11,8.06-4.89,9.05-8.78l13.45-52.76c1.02-3.99,5.42-7.37,9.71-7.4l50.26-.36,52.86-2.08c8.08-.32,15.21,3.27,16.32,11.62l5.11,38.53c.85,6.38,7.61,9.75,13.52,9.11,46.01-5,90.19-14.31,135.02-24.55,9.35-2.14,12.95,10.79,12.89,19.65l42.66-68.39c6.49-10.41,15.56-16.98,27.58-20.24l91.44-24.79ZM142.79,817.21c96.24,35.11,206.15,55.56,307.56,55.81,36.08.09,69.71-5.98,102.93-20.27,89.5-38.49,177.07-79.49,263.51-124.49,22.17-11.54,42.58-23.68,62.22-38.59l24.39-21.93c4.75-4.27,9.61-8.75,15.99-10.59l93.03-26.97c9.38-2.72,17.69-3.59,27.14-.87,35.06,10.07,79.45-7.4,98.72-37.69,5.31-8.35,7.76-17.42,3.07-26.23-4.76,18.61-15.58,31.99-30.7,41.68-45.44,29.11-77.33,7.33-83.77,9.15l-119.89,33.84-21.17,21.2c-19.9,17.75-41.42,32.61-65.41,45.22-86.18,45.31-173.68,86.41-263.07,124.95-32.81,14.15-65.65,21.63-101.36,22.14-105.92,1.5-220.71-20.39-320.16-56.72-29.45-10.68-55.82-23.83-83.88-38.25,27.43,21.67,58.01,35.53,90.88,48.64Z"/>
      </svg>
    </button>}

    {open && <div className="fixed inset-x-3 bottom-[max(calc(5.5rem+env(safe-area-inset-bottom)),calc(var(--kb-inset,0px)+0.75rem))] z-50 mx-auto flex max-h-[min(78vh,calc(100dvh-10rem-env(safe-area-inset-bottom)-var(--kb-inset,0px)))] w-full max-w-[420px] flex-col overflow-hidden rounded-3xl border border-foreground/30 bg-background shadow-2xl sm:right-5 sm:left-auto sm:inset-x-auto">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]">AI Architect · Construction Assistant</p>
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