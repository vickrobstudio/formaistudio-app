import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

// Apple 5.1.2: before sending a user's content to a third-party AI service we
// must disclose what is sent, who it goes to, and obtain permission. Consent
// is remembered on the device so it's asked once.
const CONSENT_KEY = "formai-ai-consent-openai-v2";

export function hasAiConsent(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; }
}

function rememberAiConsent(): void {
  try { window.localStorage.setItem(CONSENT_KEY, "1"); } catch { /* ignore */ }
}

/**
 * Returns `ensureConsent()` — call it at the top of any action that sends user
 * content to the AI providers; it resolves `true` once the user has agreed
 * (showing the disclosure dialog the first time), or `false` if they cancel —
 * and `dialog`, which the component must render.
 */
export function useAiConsentGate() {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const pendingRef = useRef(false);

  useEffect(() => () => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    pendingRef.current = false;
  }, []);

  const ensureConsent = useCallback((): Promise<boolean> => {
    if (hasAiConsent()) return Promise.resolve(true);
    // Ignore repeated clicks while permission is pending. Only the original
    // action may continue, so accepting cannot trigger duplicate generations.
    if (pendingRef.current) return Promise.resolve(false);
    pendingRef.current = true;
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const settle = (value: boolean) => {
    setOpen(false);
    if (value) rememberAiConsent();
    resolverRef.current?.(value);
    resolverRef.current = null;
    pendingRef.current = false;
  };

  const dialog = open ? (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-5" role="dialog" aria-modal="true" aria-label="AI data sharing consent">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-sm text-foreground">
        <h2 className="text-lg font-semibold">Before you continue</h2>
        <p className="mt-3 text-muted-foreground">
          To create your result, FormAI Studio sends the images, plans or photos you upload and the text you
          enter to <b>OpenAI</b> for image generation and drawing analysis. If you choose mesh
          reconstruction, the selected images are sent to <b>Replicate</b>. These providers process
          the selected content to produce your result. Do not upload confidential material unless
          you have permission to share it with the provider.
        </p>
        <p className="mt-3 text-muted-foreground">
          See our <Link to="/privacy" className="underline">Privacy Policy</Link> for what is collected,
          how it is used, and who it is shared with.
        </p>
        <div className="mt-5 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={() => settle(false)}>Cancel</Button>
          <Button type="button" variant="studio" className="flex-1" onClick={() => settle(true)}>Agree &amp; continue</Button>
        </div>
      </div>
    </div>
  ) : null;

  return { ensureConsent, dialog };
}
