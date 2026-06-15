import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type FileUIPart, type UIMessage } from "ai";
import { Download, ImagePlus, LoaderCircle, Send, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackLink, FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { ToolInformation } from "@/components/ToolInformation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GUEST_PHOTO_CHAT_KEY } from "@/lib/guest-trial";
import { supabase } from "@/integrations/supabase/client";
import { photoInformation } from "@/lib/tool-information";
import { streamImage } from "@/lib/stream-image";

const transport = new DefaultChatTransport({ api: "/api/photo-chat" });

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
        const stored = window.localStorage.getItem(GUEST_PHOTO_CHAT_KEY);
        setInitialMessages(stored ? JSON.parse(stored) as UIMessage[] : []);
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
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [fileError, setFileError] = useState("");
  const persistedRef = useRef(new Set(initialMessages.map((message) => message.id)));
  const { messages, sendMessage, setMessages, status, error } = useChat({ id: userId ?? "guest-photo-ai", messages: initialMessages, transport });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, status]);
  useEffect(() => { if (!busy) inputRef.current?.focus(); }, [busy]);
  useEffect(() => {
    if (busy) return;
    if (!userId) { window.localStorage.setItem(GUEST_PHOTO_CHAT_KEY, JSON.stringify(messages)); return; }
    const unsaved = messages.filter((message) => !persistedRef.current.has(message.id)).map((message) => ({ user_id: userId, role: message.role, content: messageText(message) })).filter((message) => message.content);
    if (unsaved.length === 0) return;
    void supabase.from("photo_ai_messages").insert(unsaved).then(({ error: saveError }) => { if (!saveError) messages.forEach((message) => persistedRef.current.add(message.id)); });
  }, [busy, messages, userId]);

  async function submit() {
    const text = input.trim();
    if ((!text && !files?.length) || busy) return;
    setInput("");
    if (text && files) await sendMessage({ text, files });
    else if (files) await sendMessage({ files });
    else await sendMessage({ text });
    setFiles(null);
    setPreview(null);
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
    setFiles(selected);
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function removeImage() {
    setFiles(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function renderEdit() {
    const instruction = input.trim();
    if (!preview || instruction.length < 6 || rendering) return;
    setRendering(true);
    setFileError("");
    try {
      await streamImage(`${instruction}. Edit the supplied photo directly. Preserve its camera, perspective and unchanged architecture. Produce a photorealistic interior image, no text, no logos.`, preview, (image, isFinal) => { if (isFinal) setEditedImage(image); });
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : "The photo edit could not be created.");
    } finally {
      setRendering(false);
    }
  }

  async function clear() {
    setMessages([]);
    persistedRef.current.clear();
    if (userId) await supabase.from("photo_ai_messages").delete().eq("user_id", userId);
    else window.localStorage.removeItem(GUEST_PHOTO_CHAT_KEY);
    inputRef.current?.focus();
  }

  return <main className="min-h-screen bg-background"><FormaHeader /><div className="px-5 pt-7"><BackLink /></div><PageIntro eyebrow="Photo to AI" title="Photo AI chat" description={userId ? "Chat about a photo, attach object references, and render changes. Your conversation is saved." : "Chat about a photo, attach object references, and render changes without an account."} /><section className="px-5 pb-[calc(17rem+env(safe-area-inset-bottom))]"><div className="space-y-4">{messages.length === 0 && <><p className="organic-divider py-8 text-center text-sm text-muted-foreground">Upload a room, describe what to add, remove or change, then render the edit directly from the chat.</p><ToolInformation sections={photoInformation} /></>}{messages.map((message) => <div key={message.id} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-foreground text-background" : "bg-secondary text-foreground"}`}>{messageImages(message).map((image, index) => <img key={`${image.url}-${index}`} src={image.url} alt="Attached room" className="mb-2 max-h-72 w-full rounded-xl object-cover" />)}{messageText(message)}</div>)}{editedImage && <div className="space-y-2"><img src={editedImage} alt="AI-edited room" className="w-full rounded-2xl border border-border" /><Button asChild variant="outline" className="w-full"><a href={editedImage} download="formai-photo-edit.png"><Download />Download edit</a></Button></div>}{status === "submitted" && <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Photo AI is thinking…</div>}{error && <p role="alert" className="text-xs text-destructive">{error.message}</p>}<div ref={endRef} /></div></section><div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background p-3"><div className="mx-auto max-w-xl">{preview && <div className="relative mb-2 w-fit"><img src={preview} alt="Selected attachment" className="h-20 w-20 rounded-xl border border-border object-cover" /><Button type="button" variant="default" size="icon" aria-label="Remove image" className="absolute -right-2 -top-2 size-7 min-h-0 rounded-full" onClick={removeImage}><X className="size-3" /></Button></div>}{fileError && <p role="alert" className="mb-2 text-xs text-destructive">{fileError}</p>}<div className="mb-2 flex items-end gap-2"><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => selectImage(event.target.files)} /><Button type="button" variant="ghost" size="icon" aria-label="Attach photo" disabled={busy || rendering} onClick={() => fileRef.current?.click()}><ImagePlus /></Button><Textarea ref={inputRef} autoFocus value={input} maxLength={2000} rows={1} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder="Add, remove, relight or redesign…" className="min-h-11 resize-none rounded-2xl" /><Button size="icon" aria-label="Send message" disabled={busy || (!input.trim() && !files?.length)} onClick={() => void submit()}>{busy ? <LoaderCircle className="animate-spin" /> : <Send />}</Button><Button variant="ghost" size="icon" aria-label="Clear conversation" onClick={clear}><Trash2 /></Button></div><Button variant="studio" className="h-11 w-full" disabled={!preview || input.trim().length < 6 || rendering} onClick={() => void renderEdit()}>{rendering ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{rendering ? "Rendering edit…" : "Render this edit"}</Button></div></div><ToolTabBar /></main>;
}