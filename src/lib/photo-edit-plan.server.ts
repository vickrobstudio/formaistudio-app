export type EditPlan = { status: "ready" | "clarify"; instruction: string; preserve: string[]; questions: string[] };
export function parseEditPlan(value: unknown): EditPlan {
  const p = value as EditPlan;
  if (!p || !["ready","clarify"].includes(p.status) || typeof p.instruction !== "string" || p.instruction.length > 5000 ||
    !Array.isArray(p.preserve) || p.preserve.length > 8 || p.preserve.some(s=>typeof s !== "string" || s.length > 500) ||
    !Array.isArray(p.questions) || p.questions.length > 3 || p.questions.some(s=>typeof s !== "string" || !s.trim() || s.length > 500) ||
    (p.status === "ready" && (!p.instruction.trim() || p.questions.length !== 0)) ||
    (p.status === "clarify" && !p.questions.length)) throw new Error("The edit could not be clarified. Please try again.");
  return p;
}
export const EDIT_PLANNING_RULES = `You plan architectural photo edits; you do not generate images.
The supplied image is the CURRENT version, including accepted earlier edits. The latest user request has priority over older conversation. Use only relevant recent context to resolve references; never revive canceled requests. Assistant suggestions are not user approval.
If the target object, intended material/color, scope, or conflicting instructions are uncertain, return clarify with 1-3 short specific questions in the user's language. Do not invent their answer. If clear, return ready with a concise complete production instruction and the things to preserve. In ready, questions must be empty. In clarify, do not claim rendering happened.
Preserve camera, composition, architecture and all unrequested details by default. Do not impose warm lighting or add greenery unless requested. Reference images are supporting materials, not a replacement for the current scene. User answers clarify the original request; a later explicit correction overrides it.
Output only JSON with status, instruction, preserve, questions.`;
export async function planPhotoEdit(input: { image: string; request: string; history: Array<{role: string;text: string}>; answers: Array<{question:string;answer:string}>; referenceCount: number }, key: string, signal?: AbortSignal): Promise<EditPlan> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},
    signal: AbortSignal.any([AbortSignal.timeout(45000), ...(signal ? [signal] : [])]),
    body: JSON.stringify({model:process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4.1", temperature:0.2,max_tokens:1500,response_format:{type:"json_schema",json_schema:{name:"photo_edit_plan",strict:true,schema:{type:"object",additionalProperties:false,required:["status","instruction","preserve","questions"],properties:{status:{type:"string",enum:["ready","clarify"]},instruction:{type:"string"},preserve:{type:"array",items:{type:"string"}},questions:{type:"array",items:{type:"string"}}}}},
      messages:[{role:"system",content:EDIT_PLANNING_RULES},{role:"user",content:[
        {type:"text",text:JSON.stringify({recentContext:input.history.slice(-6),latestRequest:input.request,clarifications:input.answers,referenceCount:input.referenceCount})},
        {type:"image_url",image_url:{url:input.image,detail:"auto"}}
      ]}]})
  });
  const payload = await response.json().catch(()=>null);
  if (!response.ok) { console.error("photo_edit_plan_provider", {status:response.status,code:payload?.error?.code,type:payload?.error?.type,param:payload?.error?.param}); throw new Error("Photo AI could not review this edit. Please retry; no image was generated."); }
  let plan: unknown;
  try { plan=JSON.parse(payload?.choices?.[0]?.message?.content ?? ""); } catch { throw new Error("Photo AI returned an incomplete edit plan. Please retry."); }
  return parseEditPlan(plan);
}
