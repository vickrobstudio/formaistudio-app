/**
 * Native iOS polish — runs only inside the Capacitor shell, no-op in the
 * browser. Safe to import from client components.
 */
import { Capacitor } from "@capacitor/core";

let initialised = false;

export async function initNativeIOS() {
  if (initialised) return;
  if (typeof window === "undefined") return;
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== "ios") return;
  initialised = true;

  try {
    const [{ StatusBar, Style }, { SplashScreen }, { App }, { Haptics, ImpactStyle }, { Keyboard }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
      import("@capacitor/app"),
      import("@capacitor/haptics"),
      import("@capacitor/keyboard"),
    ]);

    // Status bar overlays the WebView so the beige wallpaper bleeds under the notch.
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});

    // Dismiss the launch screen as soon as React has rendered.
    await SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});

    // Light haptic when iOS hardware back-swipe pops a route.
    App.addListener("backButton", () => {
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      window.history.back();
    });

    // Keep the WebView from scrolling when the keyboard appears.
    Keyboard.addListener("keyboardWillShow", () => {
      document.documentElement.classList.add("keyboard-open");
    });
    Keyboard.addListener("keyboardWillHide", () => {
      document.documentElement.classList.remove("keyboard-open");
    });
  } catch (error) {
    // Plugins are optional in dev / web — never crash the app over native polish.
    console.warn("[native-ios] init failed", error);
  }
}

/** Fire a light tap haptic on any pressable element. Safe in the browser. */
export async function tapHaptic() {
  if (typeof window === "undefined") return;
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* no-op */
  }
}