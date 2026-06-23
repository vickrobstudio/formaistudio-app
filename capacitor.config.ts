import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the FormAI iOS shell.
 *
 * The `.ipa` now ships a pre-built SPA bundle (produced by `bun run build:ios`
 * into `dist-ios/client`). The shell loads its own UI from disk — no
 * Safari hand-off, works offline for navigation. Server functions still live
 * on https://formaistudio.app; the bundled app fetches them cross-origin via
 * the bridge in `src/lib/ios-server-fn-bridge.ts`.
 */
const config: CapacitorConfig = {
  appId: "app.formaistudio.formai",
  appName: "FormAI",
  webDir: "dist/client",
  // Production hosts the SPA bundle reaches cross-origin for server fns/api.
  server: {
    cleartext: false,
    androidScheme: "https",
    iosScheme: "capacitor",
    allowNavigation: ["formaistudio.app", "www.formaistudio.app"],
  },
  ios: {
    contentInset: "always",
    // Keeps all navigation inside WKWebView instead of handing the URL off
    // to Safari. Requires WKAppBoundDomains in Info.plist (set in codemagic.yaml).
    limitsNavigationsToAppBoundDomains: true,
    // Disable WebKit's rubber-band bounce so the app does not feel like a browser.
    scrollEnabled: true,
    backgroundColor: "#FBF5E7",
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#FBF5E7",
      iosSpinnerStyle: "small",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#FBF5E7",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: "native",
      style: "DEFAULT",
      resizeOnFullScreen: true,
    },
  },
};

export default config;