import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the FormAI Studio iOS shell.
 *
 * The `.ipa` now ships a pre-built SPA bundle (produced by `bun run build:ios`
 * into `dist-ios/client`). The shell loads its own UI from disk — no
 * Safari hand-off, works offline for navigation. Server functions still live
 * on https://formaistudio.app; the bundled app fetches them cross-origin via
 * the bridge in `src/lib/ios-server-fn-bridge.ts`.
 */
const config: CapacitorConfig = {
  appId: "app.formaistudio.formai",
  appName: "FormAI Studio",
  webDir: "dist/client",
  // Production hosts the SPA bundle reaches cross-origin for server fns/api.
  server: {
    cleartext: false,
    androidScheme: "https",
    iosScheme: "capacitor",
    allowNavigation: ["formaistudio.app", "www.formaistudio.app"],
  },
  ios: {
    // Edge-to-edge: the web app handles safe areas itself via
    // viewport-fit=cover + env(safe-area-inset-*) paddings.
    contentInset: "never",
    // App-bound-domain limiting is OFF: the UI ships inside the .ipa and
    // WKAppBoundDomains is intentionally absent from Info.plist — with the
    // flag on and no bound-domain list, WebKit terminates the content
    // process on launch (black screen).
    limitsNavigationsToAppBoundDomains: false,
    // Disable WebKit's rubber-band bounce so the app does not feel like a browser.
    scrollEnabled: true,
    backgroundColor: "#3A3A3A",
    preferredContentMode: "mobile",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: "#3A3A3A",
      iosSpinnerStyle: "small",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#3A3A3A",
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
