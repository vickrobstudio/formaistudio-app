import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import architectHat from "@/assets/recovered/architect-hat.png";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const topics = [
  { question: "How do I start?", answer: "Start in Home to explore the community, or open Tools to choose what you want to create. You can browse both without signing in. Sign in when you're ready to generate, purchase a plan or save your work.", to: "/feed", action: "Explore Home" },
  { question: "Turn a floor plan into 3D", answer: "Open 2D to 3D and upload a clear plan. Review and correct the detected parts in 2D, then mark two points with a known distance to set the scale. Create the model and drag to rotate it. Check walls, openings and measurements before approving an export.", to: "/2d-to-3d", action: "Open 2D to 3D" },
  { question: "Edit a room photo", answer: "Open Photo AI, upload your photo and describe the change you want. Be specific about what to keep. Review any clarification questions and the proposed edit before generating the final image.", to: "/photo-to-ai", action: "Open Photo AI" },
  { question: "Find the right tool", answer: "Use 2D to 3D for floor plans, Studio AI for design concepts, and Photo AI for changes to an existing room photo. Tools shows the available options so you can choose your starting point.", to: "/tools", action: "Browse Tools" },
  { question: "How do credits work?", answer: "AI generations use the credits linked to your account. Review your Wallet and the current plan details before starting. Browsing Home and using this app guide do not spend AI credits.", to: "/pricing", action: "View plans" },
] as const;

/** Public product guidance: no account, AI request, or credit deduction. */
export function LandingArchitectGuide() {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<number | null>(null);
  const selected = topic === null ? null : topics[topic];
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label="Open AI Architect Agent app guide" className="fixed bottom-[calc(9rem+env(safe-area-inset-bottom))] right-4 z-40 flex min-h-12 items-center gap-2 rounded-full border border-white/40 bg-black px-4 py-3 text-xs font-medium text-white shadow-lg transition-colors hover:bg-neutral-800 sm:bottom-[calc(5rem+env(safe-area-inset-bottom))]">
        <img src={architectHat} alt="" className="h-7 w-9 object-contain invert" /><span>AI Architect Agent</span>
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="end" sideOffset={12} collisionPadding={12} aria-label="AI Architect Agent app guide" className="w-[min(360px,calc(100vw-24px))] max-h-[min(70dvh,540px)] overflow-y-auto rounded-3xl border-neutral-200 bg-white p-5 text-neutral-900 shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold">AI Architect Agent</h2><p className="mt-1 text-xs text-neutral-500">Your FormAI Studio app guide</p></div>
        <button type="button" aria-label="Close app guide" onClick={() => setOpen(false)} className="-mr-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-neutral-100"><X className="size-4" /></button>
      </div>
      <div className="mt-4 rounded-2xl rounded-tl-sm bg-neutral-100 p-4 text-sm leading-6">
        Hi! I can show you how to use FormAI Studio. Bring a drawing or room photo, refine your ideas and review your results. What would you like to do?
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Choose a help topic">
        {topics.map((item, index) => <button key={item.question} type="button" aria-pressed={topic === index} onClick={() => setTopic(index)} className={`min-h-11 rounded-2xl border px-3 py-2 text-left text-xs transition-colors ${topic === index ? "border-black bg-black text-white" : "border-neutral-200 bg-white hover:bg-neutral-100"}`}>{item.question}</button>)}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        {selected && <div className="mt-4 rounded-2xl rounded-tl-sm bg-neutral-100 p-4 text-sm leading-6"><p>{selected.answer}</p><Link to={selected.to} onClick={() => setOpen(false)} className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{selected.action}</Link></div>}
      </div>
    </PopoverContent>
  </Popover>;
}

