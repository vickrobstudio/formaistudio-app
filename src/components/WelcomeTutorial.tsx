import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Armchair, Image, Layers3, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const slides = [
  { icon: Image, title: "See what your space could become", subtitle: "Your AI interior design app", text: "Turn photos, floor plans and ideas into realistic design visuals. Start with Photo AI: upload a room, describe your changes, then review the edit before generating.", step: "Save your finished image or share your creation with the community." },
  { icon: Armchair, title: "AI Furniture: explore your next piece", subtitle: "AI Design for materials, colors and finishes", text: "Explore furniture concepts in Studio AI. To create an editable model, open Plan to 3D, choose Furniture and upload a clear drawing or reference.", step: "Describe the materials you want. Review the model before downloading its separate parts." },
  { icon: Ruler, title: "AI Plan: give your drawing dimension", subtitle: "AI Architecture tools for scale and space", text: "Choose Building in Plan to 3D and upload your floor plan. Set the scale using a known measurement, then review the detected walls, doors, windows and furniture.", step: "Correct the selected parts and materials before building your model." },
  { icon: Layers3, title: "AI 3D Model: rotate, review and explore", subtitle: "Your design, from every angle", text: "Drag to rotate your model and check its proportions. Explore AR on supported devices, then download the available 3D formats to continue editing.", step: "Browse Home without signing in. Sign in when you are ready to use account features." },
];

export function WelcomeTutorial({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState(0);
  const slide = slides[step];
  const Icon = slide.icon;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-3xl p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">FormAI Studio · {step + 1} of 4</p>
      <div className="my-2 flex h-28 items-center justify-center rounded-2xl bg-secondary"><Icon className="size-12" strokeWidth={1.25} /></div>
      <DialogTitle className="text-2xl leading-tight">{slide.title}</DialogTitle>
      <p className="text-sm font-medium">{slide.subtitle}</p>
      <DialogDescription className="text-base leading-relaxed">{slide.text}</DialogDescription>
      <p className="text-sm leading-relaxed text-muted-foreground">{slide.step}</p>
      <div className="flex justify-center gap-2" aria-label="Tutorial slides">{slides.map((item, index) => <button key={item.title} type="button" aria-label={`Slide ${index + 1}: ${item.title}`} aria-current={index === step ? "step" : undefined} onClick={() => setStep(index)} className="grid size-11 place-items-center"><span className={`h-2 rounded-full ${index === step ? "w-6 bg-foreground" : "w-2 bg-muted-foreground/40"}`} /></button>)}</div>
      <div className="flex items-center justify-between gap-3">
        {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <Button variant="ghost" asChild><Link to="/feed">Skip to Home</Link></Button>}
        {step < 3 ? <Button onClick={() => setStep(step + 1)}>Next <ArrowRight /></Button> : <Button asChild><Link to="/feed">Go to Home <ArrowRight /></Link></Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
