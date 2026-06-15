import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Heart, MessageCircle, Send, Share } from "lucide-react";
import { useState } from "react";
import { FormaHeader, PageIntro, ToolTabBar } from "@/components/FormaMobile";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { addCreationComment, getPublicFeed, toggleCreationFavorite, toggleCreationLike } from "@/lib/feed.functions";
import { useCredits } from "@/hooks/use-credits";

export function CommunityFeed() {
  const queryClient = useQueryClient();
  const { signedIn } = useCredits();
  const like = useServerFn(toggleCreationLike);
  const favorite = useServerFn(toggleCreationFavorite);
  const comment = useServerFn(addCreationComment);
  const { data: creations = [], isLoading } = useQuery({ queryKey: ["public-feed"], queryFn: () => getPublicFeed() });
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [message, setMessage] = useState("");
  const action = useMutation({
    mutationFn: async ({ type, creationId }: { type: "like" | "favorite"; creationId: string }) => type === "like" ? like({ data: { creationId } }) : favorite({ data: { creationId } }),
    onSuccess: (_result, variables) => { setMessage(variables.type === "like" ? "Like updated" : "Library updated"); void queryClient.invalidateQueries({ queryKey: ["public-feed"] }); },
    onError: () => setMessage("Sign in to interact with community work."),
  });
  const postComment = useMutation({
    mutationFn: ({ creationId, body }: { creationId: string; body: string }) => comment({ data: { creationId, body } }),
    onSuccess: () => { setCommentBody(""); setCommentFor(null); setMessage("Comment posted"); void queryClient.invalidateQueries({ queryKey: ["public-feed"] }); },
    onError: () => setMessage("Sign in to comment."),
  });

  async function shareCreation(title: string) {
    const shareData = { title: `${title} — FormAI STUDIO`, url: window.location.href };
    if (navigator.share) await navigator.share(shareData);
    else { await navigator.clipboard.writeText(window.location.href); setMessage("Link copied"); }
  }

  return <main className="min-h-screen bg-background text-foreground"><FormaHeader /><PageIntro eyebrow="Community" title="Discover what others create" description="Explore public interiors, renderings and original furniture from the FormAI community." />
    {message && <p role="status" className="mx-5 mb-4 rounded-xl border border-border px-4 py-3 text-xs">{message}</p>}
    <section className="mx-auto max-w-2xl pb-[calc(6rem+env(safe-area-inset-bottom))]">
      {isLoading && <p className="px-5 py-12 text-center text-sm text-muted-foreground">Loading the community…</p>}
      {!isLoading && creations.length === 0 && <div className="px-5 py-12 text-center"><p className="text-xl font-light">The feed is ready</p><p className="mt-2 text-sm text-muted-foreground">Public creations shared by members will appear here.</p><Button asChild className="mt-6"><Link to="/create">Create the first piece</Link></Button></div>}
      {creations.map((creation) => <article key={creation.id} className="border-b border-border pb-7 mb-7">
        <div className="flex items-center gap-3 px-5 pb-3"><Avatar><AvatarImage src={creation.creatorAvatarUrl ?? undefined} alt={`${creation.creatorName} profile photo`} className="object-cover" /><AvatarFallback>{creation.creatorName.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><div><p className="text-sm font-semibold">{creation.creatorName}</p><p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{creation.creationType} · {new Date(creation.createdAt).toLocaleDateString()}</p></div></div>
        <img src={creation.imageUrl} alt={creation.title} loading="lazy" className="aspect-[4/5] w-full object-cover" />
        <div className="flex items-center px-3 pt-2">
          <Button type="button" variant="ghost" size="icon" aria-label={`Like ${creation.title}`} onClick={() => action.mutate({ type: "like", creationId: creation.id })}><Heart /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Comment on ${creation.title}`} onClick={() => setCommentFor(commentFor === creation.id ? null : creation.id)}><MessageCircle /></Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Share ${creation.title}`} onClick={() => void shareCreation(creation.title)}><Share /></Button>
          <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label={`Save ${creation.title} to library`} onClick={() => action.mutate({ type: "favorite", creationId: creation.id })}><Bookmark /></Button>
        </div>
        <div className="px-5"><p className="text-xs">{creation.likeCount} {creation.likeCount === 1 ? "like" : "likes"}</p><h2 className="mt-3 text-lg font-semibold">{creation.title}</h2>{creation.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{creation.description}</p>}
          {creation.comments.map((item) => <p key={item.id} className="mt-3 text-xs leading-5"><span className="font-semibold">{item.authorName}</span> {item.body}</p>)}
          {commentFor === creation.id && (signedIn ? <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); if (commentBody.trim()) postComment.mutate({ creationId: creation.id, body: commentBody }); }}><input value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={500} placeholder="Add a comment…" aria-label="Comment" className="min-h-11 flex-1 rounded-xl border border-input bg-background px-4 text-sm" /><Button type="submit" size="icon" aria-label="Post comment"><Send /></Button></form> : <Button asChild variant="outline" className="mt-4 w-full"><Link to="/auth">Sign in to comment</Link></Button>)}
        </div>
      </article>)}
    </section><ToolTabBar /></main>;
}