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

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

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
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
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
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "FormAI STUDIO App" },
      { name: "description", content: "Interior AI STUDIO App with 3D proposals, photorealistic renderings and more. The future of visualizations." },
      { name: "author", content: "Forma Studio" },
      { name: "google-site-verification", content: "dDJ8BTIOd5KMBg_8UnuCfzxFByXsFKFMAQioHsB-FZQ" },
      { property: "og:title", content: "FormAI STUDIO App" },
      { property: "og:description", content: "Interior AI STUDIO App with 3D proposals, photorealistic renderings and more. The future of visualizations." },
      { property: "og:type", content: "website" },
       { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "FormAI STUDIO App" },
      { name: "twitter:description", content: "Interior AI STUDIO App with 3D proposals, photorealistic renderings and more. The future of visualizations." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/saAxfikeWyUmIa5jK4TY97OlnYZ2/social-images/social-1781492090994-72360254-BBEE-41B8-AFAD-44B3C9636E22.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/saAxfikeWyUmIa5jK4TY97OlnYZ2/social-images/social-1781492090994-72360254-BBEE-41B8-AFAD-44B3C9636E22.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "FormAI STUDIO", url: "https://formaistudio.app", description: "AI-powered interior visualization, furniture design, image editing, and video creation by VICK ROB INC." },
          { "@type": "WebSite", name: "FormAI STUDIO", url: "https://formaistudio.app", description: "Create photorealistic interiors, custom furniture, AI image edits, and cinematic design videos." },
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

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
