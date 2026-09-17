import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
const Input = z.object({
  image:z.string().max(3_800_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  request:z.string().trim().min(1).max(2000),
  history:z.array(z.object({role:z.enum(["user","assistant"]),text:z.string().max(2000)})).max(6),
  answers:z.array(z.object({question:z.string().max(1500),answer:z.string().trim().min(1).max(2000)})).max(6),
  referenceCount:z.number().int().min(0).max(5),
});
export const Route = createFileRoute("/api/photo-edit-plan")({server:{handlers:{POST:async({request})=>{
  if (Number(request.headers.get("content-length") ?? 0)>4_000_000) return new Response("Image is too large",{status:413});
  const parsed=Input.safeParse(await request.json().catch(()=>null));
  if(!parsed.success) return new Response("Please provide a photo and a specific edit.",{status:400});
  const key=process.env.OPENAI_API_KEY;
  if(!key) return new Response("Photo AI is unavailable.",{status:503});
  try { const {planPhotoEdit}=await import("@/lib/photo-edit-plan.server"); return Response.json(await planPhotoEdit(parsed.data,key,request.signal)); }
  catch { return new Response("The edit could not be reviewed. Please retry; no image was generated.",{status:502}); }
}}}});
