const INSTAGRAM_HANDLE = "@formaistudio.app";
const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/formaistudio.app/";
const SHARE_CAPTION = `Made with FormAI Studio ✨ ${INSTAGRAM_HANDLE}`;

/**
 * Instagram's share sheet and Stories composer don't accept a pre-filled
 * caption from a third-party share extension, so we copy the suggested
 * caption to the clipboard for the user to paste after the image lands.
 */
export async function shareToInstagram(url: string, filename: string, mimeType: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The image could not be prepared for sharing.");
  const file = new File([await response.blob()], filename, { type: mimeType });

  try { await navigator.clipboard.writeText(SHARE_CAPTION); } catch { /* clipboard is a nice-to-have */ }

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text: SHARE_CAPTION });
      return;
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      // Fall through to the manual path below on any other failure.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  window.open(INSTAGRAM_PROFILE_URL, "_blank", "noopener,noreferrer");
}
