/**
 * Client-side image shrinker for server-bound payloads.
 *
 * Vercel rejects request bodies over ~4.5MB, and real floor-plan photos and
 * scans easily exceed that as data URLs — which silently broke every AI tool
 * for large uploads. Claude vision downsamples to ~1.5k px anyway, so nothing
 * is lost by capping the long side and re-encoding as JPEG on a white
 * background (plans stay black-on-white). Falls back to the original on any
 * decode failure (e.g. non-image data).
 */
export async function shrinkImageDataUrl(
  dataUrl: string,
  maxSide = 2000,
  quality = 0.85,
): Promise<string> {
  try {
    if (!dataUrl.startsWith("data:image/")) return dataUrl;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode the image."));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    // Already small in pixels AND bytes — leave untouched.
    if (scale === 1 && dataUrl.length < 2_500_000) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", quality);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
