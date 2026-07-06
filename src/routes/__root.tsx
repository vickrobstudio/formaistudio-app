import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { GlobalAssistant } from "@/components/GlobalAssistant";

import appCss from "../styles.css?url";
import { installIosServerFnBridge } from "../lib/ios-server-fn-bridge";

// Install the iOS server-fn fetch bridge as a side effect at module load —
// route loaders fire before useEffect, so we cannot wait for RootComponent
// to mount before patching window.fetch. No-op in the browser / on the web.
installIosServerFnBridge();

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    console.error("[root-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" },
      { title: "FormAI STUDIO — For the architects of the world" },
      { name: "description", content: "FormAI STUDIO is the creative platform for architects, interior and furniture designers — build 3D worlds and photorealistic renderings of your ideas. For human and god creators." },
      { name: "author", content: "Forma Studio" },
      { name: "google-site-verification", content: "dDJ8BTIOd5KMBg_8UnuCfzxFByXsFKFMAQioHsB-FZQ" },
      { property: "og:title", content: "FormAI STUDIO — For the architects of the world" },
      { property: "og:description", content: "The creative platform for architects, interior and furniture designers to build 3D worlds and photorealistic renderings. For human and god creators." },
      { property: "og:type", content: "website" },
       { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "FormAI STUDIO — For the architects of the world" },
      { name: "twitter:description", content: "The creative platform for architects, interior and furniture designers to build 3D worlds and photorealistic renderings." },
      { property: "og:image", content: "https://formaistudio.app/og-image.png?v=3" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:alt", content: "FormAI STUDIO" },
      { name: "twitter:image", content: "https://formaistudio.app/og-image.png?v=3" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png?v=3" },
      { rel: "shortcut icon", type: "image/png", href: "/favicon.png?v=3" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "FormAI STUDIO", url: "https://formaistudio.app", description: "Creative platform for architects, interior and furniture designers — 3D worlds and photorealistic renderings, by VICK ROB INC." },
          { "@type": "WebSite", name: "FormAI STUDIO", url: "https://formaistudio.app", description: "For architects, interior and furniture designers building 3D worlds and photorealistic renderings of their ideas. For human and god creators." },
        ],
      }),
    }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    void import("../lib/native-ios").then((m) => m.initNativeIOS());
    void import("../lib/keyboard-inset").then((m) => m.installKeyboardInsetTracker());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <div className="mx-auto w-full md:min-h-screen md:max-w-[1200px] md:bg-background">
        <Outlet />
      </div>
      <GlobalAssistant />
    </QueryClientProvider>
  );
}
