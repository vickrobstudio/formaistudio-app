import { useEffect,useMemo,useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getCreditAccount } from "@/lib/credits.functions";
import { toolUnlockedBy } from "@/lib/plans";
export interface SubscriptionState {loading:boolean;isActive:boolean;status:string|null;plan:string|null;currentPeriodEnd:string|null;cancelAtPeriodEnd:boolean;activePlans:Set<string>;hasTool:(toolPath:string)=>boolean;}
export function useSubscription(){
 const readAccount=useServerFn(getCreditAccount);
 const [account,setAccount]=useState<{owner:boolean;activePlans:string[];expiresAt:string|null}|null>(null);
 const [loading,setLoading]=useState(true);
 useEffect(()=>{let canceled=false;
  const update=async()=>{try{const {data}=await supabase.auth.getSession();const next=data.session?await readAccount():null;if(!canceled)setAccount(next);}catch{if(!canceled)setAccount(null);}finally{if(!canceled)setLoading(false);}};
  const refresh=()=>{void update();};refresh();
  const {data}=supabase.auth.onAuthStateChange(()=>queueMicrotask(refresh));
  window.addEventListener("focus",refresh);window.addEventListener("formai-credits-changed",refresh);
  return ()=>{canceled=true;data.subscription.unsubscribe();window.removeEventListener("focus",refresh);window.removeEventListener("formai-credits-changed",refresh);};
 },[readAccount]);
 return useMemo<SubscriptionState>(()=>{const activePlans=new Set(account?.activePlans??[]);return {loading,isActive:!!account?.owner||activePlans.size>0,status:activePlans.size?"active":null,plan:account?.activePlans[0]??null,currentPeriodEnd:account?.expiresAt??null,cancelAtPeriodEnd:false,activePlans,hasTool:(path)=>!!account?.owner||toolUnlockedBy(activePlans,path)};},[account,loading]);
}
