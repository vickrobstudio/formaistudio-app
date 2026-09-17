import { meteredFetch, GenerationBillingError } from "./generation-billing.server";
export type GatewayPart = Record<string, unknown>;
export type ExtractionResult = {ok:true;text:string}|{ok:false;error:string;status?:number};
export async function openAIExtractJson(options:{parts:GatewayPart[];system?:string;maxTokens?:number;timeoutMs?:number}):Promise<ExtractionResult> {
  const key=process.env.OPENAI_API_KEY;
  if(!key) return {ok:false,error:"The drawing analysis service is unavailable.",status:503};
  if(!options.parts.length) return {ok:false,error:"Nothing to analyse.",status:400};
  try {
    const response=await meteredFetch("drawing", "https://api.openai.com/v1/chat/completions",{
      method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
      signal:AbortSignal.timeout(Math.min(options.timeoutMs??180000,240000)),
      body:JSON.stringify({model:process.env.OPENAI_CHAT_MODEL?.trim()||"gpt-4.1",max_tokens:Math.min(options.maxTokens??16000,16000),response_format:{type:"json_object"},messages:[
        {role:"system",content:options.system??"Read the supplied drawing carefully. Return valid JSON in the requested schema. Report uncertainty instead of inventing dimensions."},
        {role:"user",content:options.parts}
      ]})
    });
    const payload=await response.json().catch(()=>null);
    if(!response.ok){
      console.error("drawing_analysis_failed",{status:response.status,code:payload?.error?.code,requestId:response.headers.get("x-request-id")});
      return {ok:false,status:response.status,error:response.status===429?"The studio is busy. Please retry shortly.":"The drawing could not be analysed. Please retry."};
    }
    const choice=payload?.choices?.[0];
    const text=choice?.message?.content?.trim();
    if(choice?.finish_reason!=="stop"||!text) return {ok:false,error:"The drawing analysis was incomplete. Try a clearer or smaller drawing.",status:502};
    return {ok:true,text};
  }catch(error){if(error instanceof GenerationBillingError)return {ok:false,error:error.message,status:402};return {ok:false,error:"The drawing analysis was interrupted. Please retry.",status:504};}
}
