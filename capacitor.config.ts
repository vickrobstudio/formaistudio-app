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
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;