import { useState } from "react";
import { Download, LoaderCircle, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { streamImage } from "@/lib/stream-image";
import { useAiConsentGate } from "@/hooks/use-ai-consent";

export function AiPlanGenerator({ sourceImage, kind }: { sourceImage: string | null; kind: "furniture" | "space" }) {
  const { ensureConsent, dialog: consentDialog } = useAiConsentGate();
  const [plan, setPlan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generatePlan() {
    if (!sourceImage) return;
    if (!(await ensureConsent())) return;
    setBusy(true);
    setError("");
    try {
      const prompt = kind === "furniture"
        ? "Create a precise professional 2D furniture drawing from this design: top, front and side orthographic views, clean black drafting lines on a white background, proportional dimensions and construction logic, no decorative scene, no branding."
        : "Create a precise professional 2D floor plan inferred from this interior rendering: walls, openings, furniture footprints and circulation, clean black architectural drafting lines on a white background, proportional layout, no perspective, no branding.";
      await streamImage(prompt, sourceImage, (image, isFinal) => { if (isFinal) setPlan(image); });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The 2D plan could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="space-y-3 rounded-2xl border border-border p-4">
    <div><p className="flex items-center gap-2 text-xs uppercase tracking-[0.14em]"><Ruler className="size-4" />2D plan</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Generate an editable-reference drawing from this {kind === "furniture" ? "piece" : "rendering"}.</p></div>
    {plan && <img src={plan} alt={`AI-generated 2D ${kind} plan`} className="w-full rounded-xl border border-border bg-primary" />}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" disabled={!sourceImage || busy} onClick={() => void generatePlan()}>{busy ? <LoaderCircle className="animate-spin" /> : <Ruler />}{busy ? "Drawing…" : plan ? "Regenerate" : "Create plan"}</Button><Button asChild variant="outline" disabled={!plan}>{plan ? <a href={plan} download={`formai-${kind}-2d-plan.png`}><Download />Download</a> : <span><Download />Download</span>}</Button></div>
    {consentDialog}
  </div>;
}
