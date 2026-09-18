import { Capacitor } from "@capacitor/core";

export async function saveMediaToDevice(url: string, filename: string, mimeType: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The file could not be prepared for saving.");
  const file = new File([await response.blob()], filename, { type: mimeType });
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("The image could not be prepared."));
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(file);
    });
    const path = `formai-${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const saved = await Filesystem.writeFile({ path, data, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, files: [saved.uri] });
    } catch (error) {
      if (!(error instanceof Error && /share cancel/i.test(error.message))) throw error;
    } finally {
      // The share operation has finished; remove only this temporary export.
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }
    return;
  }
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (error) {
      // Closing the share sheet is a normal user action, not a save failure.
      if (error instanceof Error && error.name === "AbortError") return;
      throw new Error("Sharing is unavailable. Try downloading the image from Safari or your computer.");
    }
  }
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

