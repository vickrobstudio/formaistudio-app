import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SaveProjectInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  mode: z.enum(["render", "3d"]),
  prompt: z.string(),
  renderImageUrl: z.string().max(8_000_000).nullable(),
  sourceImageUrl: z.string().max(8_000_000).nullable(),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("studio_projects")
      .select("id,name,mode,prompt,render_image_url,source_image_url,settings,updated_at")
      .order("updated_at", { ascending: false })
      .limit(24);
    if (error) throw new Error(error.message);
    return data;
  });

export const saveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const record = {
      user_id: context.userId,
      name: data.name,
      mode: data.mode,
      prompt: data.prompt,
      render_image_url: data.renderImageUrl,
      source_image_url: data.sourceImageUrl,
      settings: data.settings,
    };
    const query = data.id
      ? context.supabase.from("studio_projects").update(record).eq("id", data.id).eq("user_id", context.userId)
      : context.supabase.from("studio_projects").insert(record);
    const { data: saved, error } = await query.select("id,name,updated_at").single();
    if (error) throw new Error(error.message);
    return saved;
  });