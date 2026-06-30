import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAssistantPrefs } from "@/lib/assistant-prefs";

export type RoofType = "flat" | "gable" | "hip" | "shed";
export type RidgeDirection = "NS" | "EW";

export type BuildingSpec = {
  wallHeightM?: number;
  ceilingHeightM?: number;
  parapetHeightM?: number;
  roofType?: RoofType;
  roofPitchDeg?: number;
  roofHeightM?: number;
  ridgeDirection?: RidgeDirection;
  floors: Array<{ index: number; heightM?: number; label?: string }>;
};

type FloorCtx = { index: number; label: string; heightM: number; hasPlan: boolean };

type ProposalPatch = Partial<Omit<BuildingSpec, "floors">> & {
  floors?: Array<{ index: number; heightM?: number; label?: string }>;
};
type Proposal = { summary: string; patch: ProposalPatch };

function parseProposal(text: string): { before: string; proposal: Proposal | null; after: string } {
  const m = text.match(/```proposal\s*([\s\S]*?)```/);
  if (!m) return { before: text, proposal: null, after: "" };
  try {
    const parsed = JSON.parse(m[1].trim()) as Proposal;
    if (parsed && typeof parsed === "object" && parsed.patch && typeof parsed.patch === "object") {
      return {
        before: text.slice(0, m.index ?? 0),
        proposal: { summary: String(parsed.summary ?? "Apply suggestion"), patch: parsed.patch },
        after: text.slice((m.index ?? 0) + m[0].length),
      };
    }
  } catch { /* ignore */ }
  return { before: text, proposal: null, after: "" };
}

function mergeSpec(prev: BuildingSpec, patch: ProposalPatch): BuildingSpec {
  const next: BuildingSpec = { ...prev, floors: [...prev.floors] };
  for (const k of ["wallHeightM", "ceilingHeightM", "parapetHeightM", "roofPitchDeg", "roofHeightM"] as const) {
    if (typeof patch[k] === "number") next[k] = patch[k];
  }
  if (patch.roofType) next.roofType = patch.roofType;
  if (patch.ridgeDirection) next.ridgeDirection = patch.ridgeDirection;
  if (Array.isArray(patch.floors)) {
    for (const f of patch.floors) {
      const i = next.floors.findIndex((x) => x.index === f.index);
      if (i >= 0) next.floors[i] = { ...next.floors[i], ...f };
      else next.floors.push(f);
    }
  }
  return next;
}

function specLine(spec: BuildingSpec): string {
  const bits: string[] = [];
  if (spec.wallHeightM != null) bits.push(`Walls ${spec.wallHeightM.toFixed(2)} m`);
  if (spec.ceilingHeightM != null) bits.push(`Ceiling ${spec.ceilingHeightM.toFixed(2)} m`);
  if (spec.roofType) {
    const r = [`Roof ${spec.roofType}`];
    if (spec.roofPitchDeg != null) r.push(`${spec.roofPitchDeg}°`);
    if (spec.roofHeightM != null) r.push(`${spec.roofHeightM.toFixed(2)} m`);
    if (spec.ridgeDirection) r.push(spec.ridgeDirection);
    bits.push(r.join(" "));
  }
  if (spec.parapetHeightM != null) bits.push(`Parapet ${spec.parapetHeightM.toFixed(2)} m`);
  return bits.join(" · ") || "No dimensions agreed yet";
}

export function BuildAssistant({
  floors,
  hasRoofPlans,
  hasElevations,
  spec,
  onSpecChange,
}: {
  floors: FloorCtx[];
  hasRoofPlans: boolean;
  hasElevations: boolean;
  spec: BuildingSpec;
  onSpecChange: (next: BuildingSpec) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const { lang, units, region } = useAssistantPrefs();

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/build-chat" }), []);
  const { messages, sendMessage, status } = useChat({
    id: "build-assistant",
    transport,
    onError: (e) => console.error("build chat error", e),
  });

  const ctx = useMemo(() => ({ floors, hasRoofPlans, hasElevations, spec, lang, units, region }), [floors, hasRoofPlans, hasElevations, spec, lang, units, region]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, status]);

  async function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setInput("");
    await sendMessage({ text: t }, { body: { context: ctx } });
  }

  async function autoDetect() {
    if (!open) setOpen(true);
    await send(`Please auto-detect everything you can from the ${floors.length} floor plan${floors.length === 1 ? "" : "s"}${hasRoofPlans ? ", roof plan(s)" : ""}${hasElevations ? ", and elevation(s)" : ""} I uploaded. Start with floor 0's wall height — propose a value and wait for my approval before moving on.`);
  }

  if (!open) {
    return <div className="mt-6 rounded-2xl border border-dashed border-foreground/40 bg-secondary/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]">AI Build Architect · Live chat</p>
          <p className="mt-1 text-xs text-muted-foreground">Co-design the model with AI before building. Auto-detects wall, ceiling and roof from your drawings — asks before every dimension.</p>
          <p className="mt-2 text-[11px] font-medium text-foreground/80">{specLine(spec)}</p>
        </div>
        <Button type="button" size="sm" variant="default" onClick={() => setOpen(true)}>
          <MessageSquare className="size-3" />Open chat
        </Button>
      </div>
    </div>;
  }

  return <div className="mt-6 overflow-hidden rounded-2xl border border-foreground/30 bg-background shadow-sm">
    <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em]">AI Build Architect</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{specLine(spec)}</p>
      </div>
      <div className="flex gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => void autoDetect()} disabled={status === "submitted" || status === "streaming"}>
          <Sparkles className="size-3" />Auto-detect
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}><X className="size-3" /></Button>
      </div>
    </div>

    <div ref={scrollRef} className="max-h-[420px] min-h-[200px] space-y-3 overflow-y-auto px-4 py-3">
      {messages.length === 0 && <div className="text-xs text-muted-foreground">
        Say hi, or tap <span className="font-semibold text-foreground">Auto-detect</span> to have the AI read your drawings and propose wall heights, ceiling, and roof shape one step at a time.
      </div>}
      {messages.map((msg) => <MessageBubble
        key={msg.id}
        msg={msg}
        applied={applied}
        rejected={rejected}
        onAccept={(key, patch, summary) => {
          onSpecChange(mergeSpec(spec, patch));
          setApplied((s) => new Set(s).add(key));
          void send(`Accepted: ${summary}. Please continue with the next step.`);
        }}
        onReject={(key, summary) => {
          setRejected((s) => new Set(s).add(key));
          void send(`Rejected: ${summary}. Suggest a different value or ask me for the right one.`);
        }}
      />)}
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
        placeholder="Ask, approve, or describe the building you want…"
        className="min-h-10 max-h-32 flex-1 resize-none text-xs"
        rows={1}
      />
      <Button type="submit" size="icon" disabled={!input.trim() || status === "submitted" || status === "streaming"}>
        {status === "submitted" || status === "streaming" ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
      </Button>
    </form>
  </div>;
}

function MessageBubble({ msg, applied, rejected, onAccept, onReject }: {
  msg: UIMessage;
  applied: Set<string>;
  rejected: Set<string>;
  onAccept: (key: string, patch: ProposalPatch, summary: string) => void;
  onReject: (key: string, summary: string) => void;
}) {
  const text = msg.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const { before, proposal, after } = parseProposal(text);
  const isUser = msg.role === "user";
  const proposalKey = `${msg.id}`;
  const isApplied = applied.has(proposalKey);
  const isRejected = rejected.has(proposalKey);

  return <div className={isUser ? "flex justify-end" : ""}>
    <div className={`max-w-[88%] space-y-2 ${isUser ? "" : "w-full"}`}>
      {before.trim() && <div className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${isUser ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}>{before.trim()}</div>}
      {proposal && <div className="rounded-2xl border border-foreground/30 bg-background p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">AI proposal</p>
        <p className="mt-1 text-xs font-semibold">{proposal.summary}</p>
        <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-secondary/60 p-2 text-[10px] leading-tight text-foreground/80">{JSON.stringify(proposal.patch, null, 2)}</pre>
        {isApplied ? <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><Check className="size-3" />Accepted &amp; applied</p>
          : isRejected ? <p className="mt-2 text-[11px] font-semibold text-muted-foreground">Rejected — waiting for a new proposal</p>
          : <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" onClick={() => onAccept(proposalKey, proposal.patch, proposal.summary)}><Check className="size-3" />Accept</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onReject(proposalKey, proposal.summary)}><X className="size-3" />Reject</Button>
            </div>}
      </div>}
      {after.trim() && <div className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs ${isUser ? "bg-foreground text-background" : "bg-secondary text-foreground"}`}>{after.trim()}</div>}
    </div>
  </div>;
}