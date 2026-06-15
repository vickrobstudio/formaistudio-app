export async function saveMediaToDevice(url: string, filename: string, mimeType: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The file could not be prepared for saving.");
  const file = new File([await response.blob()], filename, { type: mimeType });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}