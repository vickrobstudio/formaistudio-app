import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, CircleHelp, Instagram, LoaderCircle, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { DashboardDetail } from "@/components/DashboardDetail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount, getMyProfile, setMyAvatarPath, updateMyProfile } from "@/lib/profile.functions";
import { useAssistantPrefs, REGION_LABELS, type AssistantRegion } from "@/lib/assistant-prefs";
import { useInstagramConnection } from "@/hooks/use-instagram-connection";
import { completeInstagramConnect, disconnectInstagram, startInstagramConnect } from "@/lib/instagram-connect.functions";

export const Route = createFileRoute("/_authenticated/account")({
  // code/state/error are Meta's own OAuth redirect params (Meta sends the
  // browser straight back here — see instagram-oauth.server.ts).
  validateSearch: (search: Record<string, unknown>): { code?: string; state?: string; error?: string } => ({
    code: typeof search.code === "string" ? search.code : undefined,
    state: typeof search.state === "string" ? search.state : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: AccountPage,
});

function AccountPage() {
  const user = Route.useRouteContext().user;
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const saveAvatarPath = useServerFn(setMyAvatarPath);
  const removeAccount = useServerFn(deleteMyAccount);
  const { data: profile, isLoading } = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile() });
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const shownUsername = username || profile?.username || "";
  const { lang: aiLang, units: aiUnits, region: aiRegion, setLang: setAiLang, setUnits: setAiUnits, setRegion: setAiRegion } = useAssistantPrefs();
  const { connected: instagramConnected, username: instagramUsername } = useInstagramConnection();
  const startInstagramConnectFn = useServerFn(startInstagramConnect);
  const completeInstagramConnectFn = useServerFn(completeInstagramConnect);
  const disconnectInstagramFn = useServerFn(disconnectInstagram);
  const [instagramBusy, setInstagramBusy] = useState(false);
  const [instagramOverride, setInstagramOverride] = useState<{ connected: boolean; username: string | null } | null>(null);
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const { code: igCode, state: igState, error: igOauthError } = Route.useSearch();
  useEffect(() => {
    if (igOauthError) {
      setInstagramError("Instagram connection was cancelled.");
      window.history.replaceState(null, "", "/account");
      return;
    }
    if (!igCode || !igState) return;
    setInstagramBusy(true);
    void (async () => {
      try {
        const result = await completeInstagramConnectFn({ data: { code: igCode, state: igState } });
        setInstagramOverride({ connected: true, username: result.username });
        setInstagramError(null);
      } catch (cause) {
        setInstagramError(cause instanceof Error ? cause.message : "Could not connect Instagram.");
      } finally {
        setInstagramBusy(false);
        window.history.replaceState(null, "", "/account");
      }
    })();
    // Runs once for the code/state this page loaded with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function connectInstagram() {
    setInstagramBusy(true);
    try {
      const { authorizeUrl } = await startInstagramConnectFn();
      // target=_blank so Capacitor's iOS shell hands the Facebook Login
      // dialog to the system browser instead of blocking in-app navigation
      // to a domain outside allowNavigation.
      window.open(authorizeUrl, "_blank", "noopener,noreferrer");
    } finally {
      setInstagramBusy(false);
    }
  }
  async function disconnectInstagramAccount() {
    setInstagramBusy(true);
    try { await disconnectInstagramFn(); setInstagramOverride({ connected: false, username: null }); setInstagramError(null); }
    finally { setInstagramBusy(false); }
  }
  const instagramIsConnected = instagramOverride ? instagramOverride.connected : instagramConnected;
  const instagramDisplayUsername = instagramOverride ? instagramOverride.username : instagramUsername;

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 5_000_000) return setMessage("Choose a JPG or PNG smaller than 5 MB.");
    setBusy(true); setMessage("");
    try {
      const path = `${user.id}/profile/avatar`;
      const { error } = await supabase.storage.from("user-outputs").upload(path, file, { contentType: file.type, upsert: true });
      if (error) throw error;
      await saveAvatarPath({ data: { avatarPath: path } });
      await queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      setMessage("Profile photo updated.");
    } catch { setMessage("Unable to update your profile photo."); } finally { setBusy(false); }
  }

  async function submitProfile() {
    setBusy(true); setMessage("");
    try { await saveProfile({ data: { username: shownUsername } }); await queryClient.invalidateQueries({ queryKey: ["my-profile"] }); setMessage("Username saved for future and existing feed posts."); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to save your profile."); }
    finally { setBusy(false); }
  }

  async function permanentlyDelete() {
    setBusy(true); setMessage("");
    try {
      await queryClient.cancelQueries();
      await removeAccount({ data: { confirmation: "DELETE" } });
      queryClient.clear();
      await supabase.auth.signOut();
      await navigate({ to: "/", replace: true });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to delete your account."); setBusy(false); }
  }

  return <DashboardDetail eyebrow="Profile" title="Account" description="Set how you appear when sharing creations and manage your account.">
    <section className="space-y-6 pb-8">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(event) => void uploadAvatar(event)} />
      <div className="flex items-center gap-4">
        <Avatar className="size-20 border border-border"><AvatarImage src={profile?.avatarUrl ?? undefined} alt="Your profile photo" className="object-cover" /><AvatarFallback><UserRound /></AvatarFallback></Avatar>
        <div><Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}><Camera />Add profile photo</Button><p className="mt-2 text-[10px] text-muted-foreground">JPG or PNG · maximum 5 MB</p></div>
      </div>
      <label className="block text-xs"><span className="font-bold uppercase tracking-[0.14em]">Username</span><Input value={shownUsername} disabled={isLoading || busy} minLength={3} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(event) => setUsername(event.target.value)} placeholder="your-name" className="mt-2 h-12" /><span className="mt-2 block text-muted-foreground">Letters, numbers, hyphens and periods only. This name appears on feed posts.</span></label>
      <Button type="button" className="w-full" disabled={busy || !/^[A-Za-z0-9][A-Za-z0-9.-]{1,28}[A-Za-z0-9]$/.test(shownUsername)} onClick={() => void submitProfile()}>{busy ? <LoaderCircle className="animate-spin" /> : <UserRound />}Save profile</Button>
      <div className="organic-divider grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 py-5"><span className="grid size-11 place-items-center rounded-full border border-border"><Instagram className="size-5" /></span><span><span className="block text-sm">Instagram</span><span className="mt-1 block text-xs text-muted-foreground">{instagramIsConnected ? `Connected as @${instagramDisplayUsername}` : "Share your creations to your own Instagram"}</span>{instagramError && <span role="alert" className="mt-1 block text-xs text-destructive">{instagramError}</span>}</span>{instagramIsConnected ? <Button type="button" size="sm" variant="outline" disabled={instagramBusy} onClick={() => void disconnectInstagramAccount()}>Disconnect</Button> : <Button type="button" size="sm" variant="outline" disabled={instagramBusy} onClick={() => void connectInstagram()}>Connect</Button>}</div>
      <div className="organic-divider py-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Email</p><p className="mt-2 text-sm">{user.email}</p></div>
      <div className="organic-divider py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">AI Architect</p>
        <p className="mt-2 text-xs text-muted-foreground">Choose the language, units and country codes the AI Architect uses everywhere in the app. Switch any time.</p>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Country / Codes</p>
            <select
              value={aiRegion}
              onChange={(event) => setAiRegion(event.target.value as AssistantRegion)}
              className="mt-2 h-12 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(Object.keys(REGION_LABELS) as AssistantRegion[]).map((r) => (
                <option key={r} value={r}>{REGION_LABELS[r]}</option>
              ))}
            </select>
            <p className="mt-2 text-[10px] text-muted-foreground">Sets which building codes the AI cites (e.g. IBC/ADA for the US, CTE for Spain). ADA stays mandatory on US projects.</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Language</p>
            <div className="mt-2 flex gap-2">
              {(["en", "es"] as const).map((l) => (
                <Button key={l} type="button" variant={aiLang === l ? "default" : "outline"} className="flex-1" onClick={() => setAiLang(l)}>
                  {l === "en" ? "English" : "Español"}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]">Units</p>
            <div className="mt-2 flex gap-2">
              {(["m", "ft"] as const).map((u) => (
                <Button key={u} type="button" variant={aiUnits === u ? "default" : "outline"} className="flex-1" onClick={() => setAiUnits(u)}>
                  {u === "m" ? "Meters" : "Feet"}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </section>
    <Link to="/contact" className="organic-divider grid min-h-16 grid-cols-[2.75rem_1fr_auto] items-center gap-3 py-3">
      <span className="grid size-11 place-items-center rounded-full border border-border"><CircleHelp className="size-5" /></span>
      <span className="text-sm">Contact &amp; help</span>
      <span className="text-[10px] text-muted-foreground">Get support</span>
    </Link>
    <section className="border-t border-destructive/40 py-8"><h2 className="text-sm font-semibold text-destructive">Delete account forever</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Permanently removes your account, cloud files, projects, creations, comments, likes and saved items. This cannot be undone.</p><Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type DELETE" className="mt-4 h-12" /><Button type="button" variant="destructive" className="mt-3 w-full" disabled={busy || confirmation !== "DELETE"} onClick={() => void permanentlyDelete()}><Trash2 />Delete account forever</Button></section>
  </DashboardDetail>;
}