/**
 * Tracks the on-screen keyboard via the VisualViewport API and exposes the
 * overlap as `--kb-inset` on <html>.
 *
 * In the native iOS shell the webview itself resizes when the keyboard opens
 * (Capacitor Keyboard `resize: "native"`), so this stays 0 there. Mobile
 * Safari keeps the layout viewport at full height instead, which would leave
 * fixed chat composers hidden behind the keyboard — they add `--kb-inset`
 * to their bottom offset so they always float just above it.
 */
export function installKeyboardInsetTracker(): void {
  if (typeof window === "undefined" || !window.visualViewport) return;
  const vv = window.visualViewport;
  const update = () => {
    const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  update();
}
