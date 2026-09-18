import { aiRequestHeaders } from "@/lib/ai-request";
import { useServerFn } from "@tanstack/react-start";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { ShareGeneratedImage } from "@/components/ShareGeneratedImage";
import { Download, ImagePlus, LoaderCircle, Send, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackLink, FormaHeader, PAGE_SHELL, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { ToolInformation } from "@/components/ToolInformation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readGuestChat, saveGuestChat, clearGuestChat } from "@/lib/guest-chat-storage";
import { GUEST_PHOTO_CHAT_KEY } from "@/lib/guest-trial";
import { supabase } from "@/integrations/supabase/client";
import { photoInformation } from "@/lib/tool-information";
import { streamImage, compressImageDataUrl } from "@/lib/stream-image";
import { FurnitureLibraryPicker } from "@/components/FurnitureLibraryPicker";
import { useCredits } from "@/hooks/use-credits";
import { useAiConsentGate } from "@/hooks/use-ai-consent";
import { shrinkImageDataUrl } from "@/lib/shrink-image";
import { SceneComposer } from "@/components/SceneComposer";
import { AiPlanGenerator } from "@/components/AiPlanGenerator";
import { saveMediaToDevice } from "@/lib/save-to-device";
import { shareToInstagram } from "@/lib/share-to-instagram";
import { useInstagramConnection } from "@/hooks/use-instagram-connection";
import { shareToMyInstagram, shareToStudioInstagram } from "@/lib/instagram-connect.functions";

const transport = new DefaultChatTransport({ api: "/api/photo-chat", headers: aiRequestHeaders });

function messageText(message: UIMessage) {
  return message.parts.map((part) => part.type === "text" ? part.text : "").join("");
}

function messageImages(message: UIMessage) {
  return message.parts.filter((part): part is FileUIPart => part.type === "file" && part.mediaType.startsWith("image/"));
}

export function PhotoAIChat() {
  const [input, setInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const id = data.user?.id ?? null;
      setUserId(id);
      if (id) {
        const { data: rows } = await supabase.from("photo_ai_messages").select("id, role, content").eq("user_id", id).order("created_at");
        setInitialMessages((rows ?? []).map((row) => ({ id: row.id, role: row.role as "user" | "assistant", parts: [{ type: "text", text: row.content }] })));
      } else {
        setInitialMessages(readGuestChat(() => window.localStorage, GUEST_PHOTO_CHAT_KEY));
      }
    })();
  }, []);

  if (initialMessages === null) return <main className="grid min-h-screen place-items-center bg-background"><LoaderCircle className="animate-spin" /></main>;
  return <PhotoAIConversation key={userId ?? "guest"} userId={userId} initialMessages={initialMessages} input={input} setInput={setInput} />;
}

function PhotoAIConversation({ userId, initialMessages, input, setInput }: { userId: string | null; initialMessages: UIMessage[]; input: string; setInput: (value: string) => void }) {
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastInstruction, setLastInstruction] = useState("");
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<{status:"ready"|"clarify";instruction:string;preserve:string[];questions:string[];request:string;image:string;refs:string[];history:Array<{role:"user"|"assistant";text:string}>;answers:Array<{question:string;answer:string}>} | null>(null);
  const [clarification, setClarification] = useState("");
  const [contextStart, setContextStart] = useState(initialMessages.length);
  const renderingRef = useRef(false);
  const [rendering, setRendering] = useState(false);
  const [fileError, setFileError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [furnitureReferences, setFurnitureReferences] = useState<string[]>([]);
  const [surfaceTexture, setSurfaceTexture] = useState<string | null>(null);
  const [locationHint, setLocationHint] = useState("");
  const { signedIn } = useCredits();
  const { ensureConsent, dialog: consentDialog } = useAiConsentGate();
  const shareToStudioInstagramFn = useServerFn(shareToStudioInstagram);
  const { connected: instagramConnected } = useInstagramConnection();
  const shareToMyInstagramFn = useServerFn(shareToMyInstagram);
  const [instaState, setInstaState] = useState<"idle" | "posting" | "posted">("idle");
  const [instaMyState, setInstaMyState] = useState<"idle" | "posting" | "posted">("idle");
  const persistedRef = useRef(new Set(initialMessages.map((message) => message.id)));
  const { messages, sendMessage, setMessages, status, error } = useChat({ id: userId ?? "guest-photo-ai", messages: initialMessages, transport });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    // Only auto-scroll once a conversation exists — on first load with no
    // messages this would scroll the page intro under the fixed header.
    if (messages.length > 0) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);
  useEffect(() => { if (!busy) inputRef.current?.focus(); }, [busy]);
  useEffect(() => {
    if (busy) return;
    if (!userId) {
      const saved = saveGuestChat(() => window.localStorage, GUEST_PHOTO_CHAT_KEY, messages);
      setStorageNotice(saved === "full" ? "" : saved === "text-only"
        ? "Your chat text is saved. Photos are available in this session only; reattach them after reloading."
        : "This browser cannot save your chat. You can continue here, but keep this page open and download any images you want to keep.");
      return;
    }
    const unsaved = messages.filter((message) => !persistedRef.current.has(message.id)).map((message) => ({ user_id: userId, role: message.role, content: messageText(message) })).filter((message) => message.content);
    if (unsaved.length === 0) return;
    void supabase.from("photo_ai_messages").insert(unsaved).then(({ error: saveError }) => { if (!saveError) messages.forEach((message) => persistedRef.current.add(message.id)); });
  }, [busy, messages, userId]);

  async function submit() {
    if (!(await ensureConsent())) return;
    const text = input.trim();
    if ((!text && !files?.length) || busy || renderingRef.current) return;
    setEditPlan(null); setClarification("");
    if (text) setLastInstruction(text);
    setInput("");
    try {
      const currentImage = editedImage ?? preview;
      const prepared = currentImage ? await compressImageDataUrl(currentImage, 3_700_000) : null;
      if (prepared && prepared.length > 3_800_000) throw new Error("Use a smaller photo.");
      const options = { body: { contextStart, currentImage: prepared } };
      await sendMessage({text:text || "Please review this photo."}, options);
    } catch(cause) { setFileError(cause instanceof Error ? cause.message : "The message could not be sent."); setInput(text); return; }
    setFiles(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function selectImage(selected: FileList | null) {
    const file = selected?.[0];
    setFileError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setFileError("Choose a JPG, PNG or WEBP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError("Image must be 10 MB or smaller.");
      return;
    }
    setEditedImage(null);
    setEditPlan(null); setClarification(""); setSurfaceTexture(null); setFurnitureReferences([]); setContextStart(messages.length);
    setLastInstruction("");
    setFiles(selected);
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = typeof reader.result === "string" ? reader.result : null;
      if (!raw) return;
      // Shrink before sending — full-size photos exceed the server's
      // request-size limit and the chat would fail silently.
      const shrunk = await shrinkImageDataUrl(raw, 1600);
      const blob = await (await fetch(shrunk)).blob();
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      setFiles(transfer.files);
      setPreview(shrunk);
    };
    reader.readAsDataURL(file);
  }

  function removeImage() {
    if (renderingRef.current) return;
    setEditedImage(null); setEditPlan(null); setClarification(""); setLastInstruction(""); setSurfaceTexture(null); setFurnitureReferences([]); setContextStart(messages.length);
    setFiles(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function renderEdit() {
    if (!(await ensureConsent())) return;
    const instruction = input.trim() || lastInstruction;
    const image = editedImage ?? preview;
    if (!image || !instruction || renderingRef.current || busy) return;
    const refs = [...furnitureReferences, ...(surfaceTexture ? [surfaceTexture] : [])].slice(0,5);
    const current = editPlan && editPlan.request === instruction && editPlan.image === image && JSON.stringify(editPlan.refs) === JSON.stringify(refs) ? editPlan : null;
    if (current?.status === "clarify" && !clarification.trim()) return;
    renderingRef.current = true; setRendering(true); setFileError("");
    try {
      if (current?.status === "ready") {
        await streamImage(current.instruction + "\nPreserve: " + current.preserve.join("; ") + ". Edit the current supplied image; preserve all unrequested details. Aim for realistic photographic materials, light and perspective. No text or logos unless requested.", image,
          (result, final) => { if (final) { setEditedImage(result); setEditPlan(null); setLastInstruction(""); setInput(""); setContextStart(messages.length); } }, refs, "photo");
      } else {
        const history = current?.history ?? messages.slice(contextStart).filter(m=>m.role==="user" || m.role==="assistant").slice(-6).map(m=>({role:m.role as "user"|"assistant",text:messageText(m).slice(-2000)}));
        const answers = current ? [...current.answers,{question:current.questions.join("\n"),answer:clarification.trim()}] : [];
        const prepared = await compressImageDataUrl(image, 3_700_000);
        if (prepared.length > 3_800_000) throw new Error("Use a smaller photo to review this edit.");
        const response = await fetch("/api/photo-edit-plan",{method:"POST",headers:{"Content-Type":"application/json", ...await aiRequestHeaders()},body:JSON.stringify({image:prepared,request:instruction,history,answers,referenceCount:refs.length})});
        if (!response.ok) throw new Error(await response.text() || "Unable to review this edit.");
        const plan = await response.json();
        if (!["ready","clarify"].includes(plan.status) || !Array.isArray(plan.questions) || !Array.isArray(plan.preserve)) throw new Error("The edit review was incomplete. Please retry.");
        setEditPlan({...plan,request:instruction,image,refs,history,answers}); setClarification("");
      }
    } catch(cause) { setFileError(cause instanceof Error ? cause.message : "The edit could not be completed."); }
    finally { renderingRef.current = false; setRendering(false); }
  }

  async function clear() {
    if (renderingRef.current || busy) return;
    setEditPlan(null); setClarification(""); setLastInstruction(""); setInput(""); setContextStart(0);
    setMessages([]);
    persistedRef.current.clear();
    if (userId) await supabase.from("photo_ai_messages").delete().eq("user_id", userId);
    else if (!clearGuestChat(() => window.localStorage, GUEST_PHOTO_CHAT_KEY)) setStorageNotice("Could not clear the saved chat on this device.");
    inputRef.current?.focus();
  }

  async function saveEdit() {
    if (!editedImage) return;
    try { await saveMediaToDevice(editedImage, editedImage.startsWith("data:image/jpeg") ? "formai-photo-edit.jpg" : "formai-photo-edit.png", editedImage.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png"); }
    catch (cause) { setFileError(cause instanceof Error ? cause.message : "The image could not be saved."); }
  }

    return <main className="min-h-screen bg-background"><FormaHeader /><div className={`${PAGE_SHELL} px-5 pt-7`}><BackLink /></div><PageIntro eyebrow="Photo to AI" title="Photo AI chat" description={userId ? "Drag saved furniture into a photo, select surfaces, and render changes through AI chat." : "Upload a photo and describe the changes you want to render."} /><section className={`${PAGE_SHELL} space-y-4 px-5 pb-[calc(23rem+env(safe-area-inset-bottom))]`}><FurnitureLibraryPicker signedIn={signedIn} selected={furnitureReferences} onToggle={(imageUrl) => setFurnitureReferences((current) => current.includes(imageUrl) ? current.filter((item) => item !== imageUrl) : current.length < 5 ? [...current, imageUrl] : current)} />{preview && <SceneComposer sourceImage={editedImage ?? preview} signedIn={signedIn} onUseComposition={(image, instruction, texture) => { if (renderingRef.current) return; setEditPlan(null); setContextStart(messages.length); setPreview(image); setEditedImage(null); setInput(instruction); setSurfaceTexture(texture); }} />}{editPlan && <section aria-label="Review your edit" className="rounded-2xl border border-border bg-secondary p-5"><h2 className="font-semibold">{editPlan.status === "clarify" ? "A few details before rendering" : "Confirm your edit"}</h2>{editPlan.status === "clarify" ? <><ul className="my-3 list-disc space-y-2 pl-5">{editPlan.questions.map((q:string)=><li key={q}>{q}</li>)}</ul><Textarea aria-label="Answers to edit questions" value={clarification} disabled={rendering} maxLength={2000} onChange={e=>setClarification(e.target.value)} placeholder="Tell us what you want…" /></> : <><p className="mt-3">{editPlan.instruction}</p><p className="mt-2 text-sm text-muted-foreground">Keep unchanged: {editPlan.preserve.join("; ")}</p></>}<p className="mt-3 text-xs text-muted-foreground">No final image is generated until you confirm the edit.</p></section>}{editedImage && !rendering && <ShareGeneratedImage key={editedImage} image={editedImage} signedIn={signedIn} />}{editedImage && <AiPlanGenerator sourceImage={editedImage} kind="space" freePhoto />}<div className="space-y-4">{messages.length === 0 && <><p className="organic-divider py-8 text-center text-sm text-muted-foreground">Upload a room, position furniture, select a material area, or describe changes in chat.</p><ToolInformation sections={photoInformation} /></>}{messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-foreground text-background" : "bg-secondary text-foreground"}`}>{messageImages(message).map((image, index) => <img key={`${image.url}-${index}`} src={image.url} alt="Attached room" className="mb-2 max-h-72 w-full rounded-xl object-cover" />)}{messageText(message)}</div>)}{editedImage && <div className="space-y-2"><img src={editedImage} alt="AI-edited room" className="w-full rounded-2xl border border-border" /><Button type="button" variant="outline" className="w-full" onClick={() => void saveEdit()}><Download />Save / Share image</Button></div>}{status === "submitted" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Photo AI is thinking…</div>}{error && <p role="alert" className="text-xs text-destructive">{error.message}</p>}<div ref={endRef} /></div></section><div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background p-3 md:bottom-0"><div className="mx-auto max-w-xl md:max-w-3xl">{preview && <div className="relative mb-2 w-fit"><img src={preview} alt="Selected attachment" className="h-20 w-20 rounded-xl border border-border object-cover" /><Button type="button" variant="default" size="icon" aria-label="Remove image" className="absolute -right-2 -top-2 size-7 min-h-0 rounded-full" disabled={rendering} onClick={removeImage}><X className="size-3" /></Button></div>}{storageNotice && <p role="status" className="mb-2 text-xs text-muted-foreground">{storageNotice}</p>}{fileError && <p role="alert" className="mb-2 text-xs text-destructive">{fileError}</p>}<div className="mb-2 flex items-end gap-2"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => selectImage(event.target.files)} /><Button type="button" variant="ghost" size="icon" aria-label="Attach photo" disabled={busy || rendering} onClick={() => fileRef.current?.click()}><ImagePlus /></Button><Textarea ref={inputRef} autoFocus value={input} maxLength={2000} rows={1} disabled={rendering} onChange={(event) => { setInput(event.target.value); setEditPlan(null); setClarification(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Describe your edit…" className="min-h-11 resize-none rounded-2xl" /><Button size="icon" aria-label="Send message" disabled={busy || rendering || (!input.trim() && !files?.length)} onClick={() => void submit()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}</Button><Button variant="ghost" size="icon" aria-label="Clear conversation" disabled={rendering || busy} onClick={clear}><Trash2 /></Button></div><Button variant="studio" className="h-11 w-full" disabled={!preview || !(input.trim() || lastInstruction) || busy || rendering || (editPlan?.status === "clarify" && !clarification.trim())} onClick={() => void renderEdit()}>{rendering ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{rendering ? (editPlan?.status === "ready" ? "Rendering edit…" : "Reviewing your edit…") : editPlan?.status === "ready" ? "Render confirmed edit" : editPlan?.status === "clarify" ? "Review my answers" : "Review this edit"}</Button></div></div><ToolTabBar />{consentDialog}</main>;
}

