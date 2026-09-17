import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getInstagramReviewQueue, reviewInstagramSubmission, publishApprovedInstagramSubmission } from "@/lib/instagram.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/instagram-review")({
  head: () => ({ meta: [{ title: "Instagram review — FormAI Studio" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: InstagramReview,
});
function InstagramReview() {
  const load = useServerFn(getInstagramReviewQueue);
  const review = useServerFn(reviewInstagramSubmission);
  const publish = useServerFn(publishApprovedInstagramSubmission);
  const queryClient = useQueryClient();
  const queue = useQuery({ queryKey: ["instagram-review"], queryFn: () => load(), retry: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function act(id: string, action: "approved" | "rejected" | "publish") {
    if (busy) return;
    setBusy(id); setMessage("");
    try {
      if (action === "publish") await publish({ data: { id } });
      else await review({ data: { id, decision: action } });
      setMessage(action === "publish" ? "Published to @formaistudio.app." : action === "approved" ? "Approved. Review the caption and select Publish when ready." : "Submission rejected.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to update this submission."); }
    finally { setBusy(null); void queryClient.invalidateQueries({ queryKey: ["instagram-review"] }); }
  }
  return <main className="mx-auto max-w-4xl space-y-6 p-6">
    <Link to="/feed" className="underline">Back to community</Link>
    <h1 className="text-2xl font-semibold">Instagram approval queue</h1>
    <p>Only the designated FormAI reviewer can approve and publish submissions to @formaistudio.app.</p>
    {queue.isPending && <p role="status">Loading submissions…</p>}
    {queue.error && <p role="alert">{queue.error.message} <Link to="/auth" className="underline">Sign in</Link></p>}
    {message && <p role="status">{message}</p>}
    {queue.data?.length === 0 && <p>No submissions yet.</p>}
    {queue.data?.map(item => <article key={item.id} className="space-y-3 rounded-xl border p-4">
      <h2 className="text-lg font-semibold">{item.title}</h2>
      <img src={item.image_data_url} alt={item.title} className="max-h-96 w-full object-contain" />
      <p className="whitespace-pre-wrap">{item.caption}</p>
      <p>Status: {item.status}</p>
      {item.status === "pending" && <div className="flex gap-3"><Button disabled={!!busy} onClick={() => void act(item.id, "approved")}>Approve</Button><Button variant="outline" disabled={!!busy} onClick={() => void act(item.id, "rejected")}>Reject</Button></div>}
      {item.status === "approved" && <Button disabled={!!busy} onClick={() => void act(item.id, "publish")}>Publish approved image to @formaistudio.app</Button>}
      {item.status === "needs_review" && <p>Check the official Instagram account before any retry. Publication may already have succeeded.</p>}
    </article>)}
  </main>;
}

