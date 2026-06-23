import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the FormAI iOS shell.
 *
 * TanStack Start is server-rendered, so there is no static `dist/` to ship
 * inside the .ipa. Instead, the native shell loads the live published web app
 * over HTTPS. `webDir` is still required by the Capacitor CLI — we point it at
 * the Vite client build output so `cap sync` is happy.
 */
const config: CapacitorConfig = {
  appId: "app.formaistudio.formai",
  appName: "FormAI",
  webDir: "dist",
  server: {
    url: "https://www.formaistudio.app",
    cleartext: false,
    androidScheme: "https",
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