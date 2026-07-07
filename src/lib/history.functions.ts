import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ActivityItem = {
  id: string;
  kind: "saved" | "shared" | "library";
  title: string;
  imageUrl: string | null;
  subtype: string | null;
  when: string;
};

/**
 * The member's own recent activity, newest first: cloud saves
 * (studio_projects), community posts they published, and pieces they saved
 * to their library (favorites). All three tables are RLS-scoped to the
 * caller, so no explicit ownership filter is needed beyond the favorites
 * join. Powers the History page.
 */
export const listMyActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [projects, posts, favorites] = await Promise.all([
      context.supabase.from("studio_projects").select("id,name,mode,render_image_url,updated_at").order("updated_at", { ascending: false }).limit(40),
      context.supabase.from("public_creations").select("id,title,image_url,creation_type,is_public,created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(40),
      context.supabase.from("creation_favorites").select("created_at,public_creations(id,title,image_url,creation_type)").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(40),
    ]);

    const items: ActivityItem[] = [
      ...(projects.data ?? []).map((p) => ({ id: `project-${p.id}`, kind: "saved" as const, title: p.name, imageUrl: p.render_image_url, subtype: p.mode, when: p.updated_at })),
      ...(posts.data ?? []).filter((c) => c.is_public).map((c) => ({ id: `post-${c.id}`, kind: "shared" as const, title: c.title, imageUrl: c.image_url, subtype: c.creation_type, when: c.created_at })),
      ...(favorites.data ?? []).flatMap((f) => {
        const item = f.public_creations as { id: string; title: string; image_url: string; creation_type: string } | null;
        return item ? [{ id: `fav-${item.id}`, kind: "library" as const, title: item.title, imageUrl: item.image_url, subtype: item.creation_type, when: f.created_at }] : [];
      }),
    ]
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .slice(0, 60);

    return items;
  });
