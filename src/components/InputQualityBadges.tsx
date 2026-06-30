// Small hint shown on upload surfaces so users know which file formats
// produce the best 2D→3D results. Ordered best → hardest.

const TIERS = [
  {
    label: "Best",
    swatch: "bg-emerald-500",
    formats: "DXF · IFC · RVT",
    note: "True vector / BIM — instant, accurate import.",
  },
  {
    label: "OK",
    swatch: "bg-amber-500",
    formats: "Vector PDF · DWG",
    note: "Vector lines — clean after auto-OCR.",
  },
  {
    label: "Hardest",
    swatch: "bg-rose-500",
    formats: "Scanned PDF · JPG · PNG",
    note: "Pixel-only — AI has to guess geometry.",
  },
] as const;

export function InputQualityBadges() {
  return (
    <ul className="mt-3 grid gap-1.5 rounded-xl border border-border bg-secondary/40 p-3 text-[11px]">
      {TIERS.map((t) => (
        <li key={t.label} className="flex items-center gap-2">
          <span className={`inline-block size-2 rounded-full ${t.swatch}`} />
          <span className="font-bold uppercase tracking-[0.14em] text-[10px] w-14">{t.label}</span>
          <span className="font-semibold">{t.formats}</span>
          <span className="text-muted-foreground">— {t.note}</span>
        </li>
      ))}
    </ul>
  );
}