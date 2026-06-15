import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, LoaderCircle, Trash2, UserRound } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { DashboardDetail } from "@/components/DashboardDetail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount, getMyProfile, setMyAvatarPath, updateMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/account")({ component: AccountPage });

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
      <div className="organic-divider py-5"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Email</p><p className="mt-2 text-sm">{user.email}</p></div>
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
    </section>
    <section className="border-t border-destructive/40 py-8"><h2 className="text-sm font-semibold text-destructive">Delete account forever</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Permanently removes your account, cloud files, projects, creations, comments, likes and saved items. This cannot be undone.</p><Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type DELETE" className="mt-4 h-12" /><Button type="button" variant="destructive" className="mt-3 w-full" disabled={busy || confirmation !== "DELETE"} onClick={() => void permanentlyDelete()}><Trash2 />Delete account forever</Button></section>
  </DashboardDetail>;
}