import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreationIdInput = z.object({ creationId: z.string().uuid() });
const CommentInput = CreationIdInput.extend({ body: z.string().trim().min(1).max(500) });
const FurnitureCreationInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  imageUrl: z.string().min(1).max(8_000_000),
  modelGlbPath: z.string().max(500).nullable(),
  modelUsdzPath: z.string().max(500).nullable(),
  isPublic: z.boolean(),
});

export type FeedCreation = {
  id: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  title: string;
  description: string;
  imageUrl: string;
  creationType: string;
  createdAt: string;
  likeCount: number;
  modelGlbUrl: string | null;
  modelUsdzUrl: string | null;
  comments: Array<{ id: string; authorName: string; body: string; createdAt: string }>;
};

export const getPublicFeed = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: creations, error } = await supabaseAdmin
    .from("public_creations")
    .select("id,user_id,creator_name,title,description,image_url,creation_type,created_at,model_glb_path,model_usdz_path")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error("The community feed is unavailable.");
  if (!creations.length) return [] as FeedCreation[];

  const ids = creations.map((creation) => creation.id);
  const userIds = [...new Set(creations.map((creation) => creation.user_id))];
  const [{ data: likes }, { data: comments }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("creation_likes").select("creation_id").in("creation_id", ids),
    supabaseAdmin.from("creation_comments").select("id,creation_id,author_name,body,created_at").in("creation_id", ids).order("created_at", { ascending: true }),
    supabaseAdmin.from("profiles").select("id,username,avatar_path").in("id", userIds),
  ]);

  const avatarUrls = new Map<string, string>();
  await Promise.all((profiles ?? []).map(async (profile) => {
    if (!profile.avatar_path) return;
    const signed = await supabaseAdmin.storage.from("user-outputs").createSignedUrl(profile.avatar_path, 3_600);
    if (signed.data?.signedUrl) avatarUrls.set(profile.id, signed.data.signedUrl);
  }));

  const modelUrls = new Map<string, { glb: string | null; usdz: string | null }>();
  await Promise.all(creations.map(async (creation) => {
    const glb = creation.model_glb_path
      ? (await supabaseAdmin.storage.from("user-outputs").createSignedUrl(creation.model_glb_path, 3_600)).data?.signedUrl ?? null
      : null;
    const usdz = creation.model_usdz_path
      ? (await supabaseAdmin.storage.from("user-outputs").createSignedUrl(creation.model_usdz_path, 3_600)).data?.signedUrl ?? null
      : null;
    modelUrls.set(creation.id, { glb, usdz });
  }));

  return creations.map((creation) => ({
    id: creation.id,
    creatorName: profiles?.find((profile) => profile.id === creation.user_id)?.username ?? creation.creator_name,
    creatorAvatarUrl: avatarUrls.get(creation.user_id) ?? null,
    title: creation.title,
    description: creation.description,
    imageUrl: creation.image_url,
    creationType: creation.creation_type,
    createdAt: creation.created_at,
    likeCount: likes?.filter((like) => like.creation_id === creation.id).length ?? 0,
    modelGlbUrl: modelUrls.get(creation.id)?.glb ?? null,
    modelUsdzUrl: modelUrls.get(creation.id)?.usdz ?? null,
    comments: (comments ?? []).filter((comment) => comment.creation_id === creation.id).slice(-3).map((comment) => ({ id: comment.id, authorName: comment.author_name, body: comment.body, createdAt: comment.created_at })),
  }));
});

export const toggleCreationLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CreationIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase.from("creation_likes").select("creation_id").eq("creation_id", data.creationId).eq("user_id", context.userId).maybeSingle();
    const result = existing
      ? await context.supabase.from("creation_likes").delete().eq("creation_id", data.creationId).eq("user_id", context.userId)
      : await context.supabase.from("creation_likes").insert({ creation_id: data.creationId, user_id: context.userId });
    if (result.error) throw new Error("Unable to update this like.");
    return { liked: !existing };
  });

export const toggleCreationFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CreationIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase.from("creation_favorites").select("creation_id").eq("creation_id", data.creationId).eq("user_id", context.userId).maybeSingle();
    const result = existing
      ? await context.supabase.from("creation_favorites").delete().eq("creation_id", data.creationId).eq("user_id", context.userId)
      : await context.supabase.from("creation_favorites").insert({ creation_id: data.creationId, user_id: context.userId });
    if (result.error) throw new Error("Unable to update your library.");
    return { saved: !existing };
  });

export const addCreationComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => CommentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase.from("profiles").select("username").eq("id", context.userId).single();
    const authorName = profile?.username || "FormAI member";
    const { error } = await context.supabase.from("creation_comments").insert({ creation_id: data.creationId, user_id: context.userId, author_name: authorName.slice(0, 80), body: data.body });
    if (error) throw new Error("Unable to post your comment.");
    return { ok: true };
  });

export const listFavoriteCreations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("creation_favorites").select("created_at,public_creations(id,title,image_url,creator_name,creation_type)").eq("user_id", context.userId).order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load your favorites.");
    return data;
  });

export const listReusableFurniture = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: owned, error: ownedError }, { data: favorites, error: favoritesError }] = await Promise.all([
      context.supabase.from("public_creations").select("id,title,image_url,creator_name,created_at,model_glb_path,model_usdz_path").eq("user_id", context.userId).eq("creation_type", "furniture").order("created_at", { ascending: false }),
      context.supabase.from("creation_favorites").select("created_at,public_creations(id,title,image_url,creator_name,creation_type,model_glb_path,model_usdz_path)").eq("user_id", context.userId).order("created_at", { ascending: false }),
    ]);
    if (ownedError || favoritesError) throw new Error("Unable to load your furniture library.");
    const saved = (favorites ?? []).flatMap((favorite) => {
      const item = favorite.public_creations;
      if (!item || item.creation_type !== "furniture") return [];
      return [{ id: item.id, title: item.title, imageUrl: item.image_url, modelGlbPath: item.model_glb_path, modelUsdzPath: item.model_usdz_path, creatorName: item.creator_name, source: "Saved" as const }];
    });
    const mine = (owned ?? []).map((item) => ({ id: item.id, title: item.title, imageUrl: item.image_url, modelGlbPath: item.model_glb_path, modelUsdzPath: item.model_usdz_path, creatorName: item.creator_name, source: "Created" as const }));
    return [...mine, ...saved.filter((savedItem) => !mine.some((ownedItem) => ownedItem.id === savedItem.id))];
  });

export const saveFurnitureCreation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => FurnitureCreationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase.from("profiles").select("username").eq("id", context.userId).single();
    const creatorName = profile?.username || "FormAI member";
    const { data: creation, error } = await context.supabase.from("public_creations").insert({
      user_id: context.userId,
      creator_name: creatorName.slice(0, 80),
      title: data.title,
      description: data.description,
      image_url: data.imageUrl,
      model_glb_path: data.modelGlbPath,
      model_usdz_path: data.modelUsdzPath,
      creation_type: "furniture",
      is_public: data.isPublic,
    }).select("id").single();
    if (error) throw new Error("Unable to save this furniture piece.");
    return creation;
  });