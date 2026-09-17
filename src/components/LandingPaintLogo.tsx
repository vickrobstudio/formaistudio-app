import logoAsset from "@/assets/recovered/formai-logo-black.png";

export function LandingPaintLogo() {
  return (
    <div
      className="pointer-events-none relative z-10 aspect-square select-none"
      style={{ width: "50vmin", height: "50vmin" }}
    >
      <img
        src={logoAsset}
        alt="FormAI Studio"
        draggable={false}
        className="absolute inset-0 size-full object-contain"
        style={{ filter: "invert(0.82)" }}
      />
    </div>
  );
}
