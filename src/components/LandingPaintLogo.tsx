export function LandingPaintLogo() {
  return (
    <div
      className="pointer-events-none relative z-10 aspect-square select-none"
      style={{ width: "50vmin", height: "50vmin" }}
    >
      <div
        role="img"
        aria-label="FORM AI"
        className="absolute inset-0 size-full"
        style={{
          backgroundColor: "oklch(0.85 0 0)",
          WebkitMaskImage: "url(/formai-logo-black.png)",
          maskImage: "url(/formai-logo-black.png)",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </div>
  );
}
