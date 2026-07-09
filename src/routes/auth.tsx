import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BackLink, FormaHeader } from "@/components/FormaMobile";
import { supabase } from "@/integrations/supabase/client";
import { getGuestCredits, GUEST_CREDITS_KEY, GUEST_PHOTO_CHAT_KEY } from "@/lib/guest-trial";
import type { UIMessage } from "ai";
import { activateVerifiedVipAccess } from "@/lib/credits.functions";

export const Route = createFileRoute("/auth")({ head: () => ({ meta: [{ title: "Sign In — FormAI STUDIO" }, { name: "description", content: "Sign in or create your FormAI STUDIO account." }, { property: "og:title", content: "Sign In — FormAI STUDIO" }, { property: "og:description", content: "Access your designs and cloud library." }] }), component: AuthPage });
function AuthPage() {
  const activateVip = useServerFn(activateVerifiedVipAccess);
  const navigate = useNavigate(); const [signup, setSignup] = useState(false); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function emailAuth() {
    setBusy(true); setError("");
    try {
      const cleanEmail = email.trim().toLowerCase();
      const result = signup
        ? await supabase.auth.signUp({ email: cleanEmail, password, options: { data: { full_name: name.trim() } } })
        : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (result.error || !result.data.user) { setBusy(false); return setError(result.error?.message ?? "Sign in failed."); }
      const userId = result.data.user.id;
      // Best-effort post-signin tasks — never block navigation.
      if (result.data.session) { try { await activateVip(); } catch (e) { console.warn("activateVip failed", e); } }
      try {
        const remaining = getGuestCredits();
        await supabase.from("guest_credit_claims").insert({ user_id: userId, remaining_credits: remaining });
      } catch (e) { console.warn("guest credit claim failed", e); }
      try {
        const savedChat = window.localStorage.getItem(GUEST_PHOTO_CHAT_KEY);
        if (savedChat) {
          const messages = JSON.parse(savedChat) as UIMessage[];
          const rows = messages.map((message) => ({ user_id: userId, role: message.role, content: message.parts.map((part) => part.type === "text" ? part.text : "").join("") })).filter((message) => (message.role === "user" || message.role === "assistant") && message.content);
          if (rows.length) await supabase.from("photo_ai_messages").insert(rows);
          window.localStorage.removeItem(GUEST_PHOTO_CHAT_KEY);
        }
      } catch (e) { console.warn("photo chat migration failed", e); }
      window.localStorage.removeItem(GUEST_CREDITS_KEY);
      setBusy(false);
      void navigate({ to: "/dashboard", replace: true });
    } catch (cause) {
      console.error("sign in failed", cause);
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    }
  }
  return <main className="min-h-screen bg-background"><FormaHeader /><section className="mx-auto max-w-md px-6 pb-16 pt-8"><BackLink to="/" label="Back to Home" /><p className="mt-12 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">My account</p><h1 className="mt-3 text-4xl font-light">{signup ? "Create account" : "Welcome back"}</h1><p className="mt-3 text-sm text-muted-foreground">{signup ? "Create your account instantly. No email verification needed." : "Sign in to open your private dashboard."}</p><div className="mt-8 space-y-4">{signup && <Input placeholder="Full name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="h-12" />}<Input type="email" autoComplete="email" maxLength={255} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" /><Input type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={8} maxLength={72} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />{signup && <p className="text-xs text-muted-foreground">Use at least 8 characters.</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}<Button variant="studio" className="h-12 w-full" disabled={busy || !email.includes("@") || password.length < 8} onClick={emailAuth}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</Button></div><Button variant="link" className="mt-5 w-full text-xs" onClick={() => { setSignup((value) => !value); setError(""); }}>{signup ? "Already have an account? Sign in" : "New here? Create an account"}</Button><div className="my-4 flex items-center gap-3 text-[10px] text-muted-foreground"><span className="h-px flex-1 bg-border" />OR<span className="h-px flex-1 bg-border" /></div><Button asChild variant="outline" className="w-full"><Link to="/tools">Try tools with 4 guest credits</Link></Button><Button asChild variant="ghost" className="mt-2 w-full text-xs"><Link to="/photo-to-ai">Open free Photo AI chat</Link></Button></section></main>;
}