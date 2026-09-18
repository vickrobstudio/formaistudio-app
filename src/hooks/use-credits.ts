import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getCreditAccount } from "@/lib/credits.functions";

export function useCredits() {
  const readAccount = useServerFn(getCreditAccount);
  const [credits,setCredits] = useState(0);
  const [signedIn,setSignedIn] = useState(false);
  const [vip,setVip] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const [reviewCredits,setReviewCredits] = useState(0);
  const [sandboxCredits,setSandboxCredits] = useState(0);
  const refresh = useCallback(async () => {
    setError(null);
    try {
    const {data, error: sessionError} = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    setSignedIn(!!data.session && !data.session.user.is_anonymous);
    if (!data.session) {setCredits(0);setVip(false);setReviewCredits(0);setSandboxCredits(0);setLoading(false);return false;}
    const account=await readAccount();setCredits(account.credits);setVip(account.owner);setReviewCredits(account.reviewCredits ?? 0);setSandboxCredits(account.sandboxCredits ?? 0);return account.owner || account.credits>0;}
    catch {setError("Unable to load your balance. Please retry.");setVip(false);return false;}
    finally {setLoading(false);}
  },[readAccount]);
  useEffect(()=>{
    const update=()=>{void refresh();};update();
    const {data}=supabase.auth.onAuthStateChange(()=>{queueMicrotask(update);});
    window.addEventListener("focus",update);window.addEventListener("formai-credits-changed",update);
    return ()=>{data.subscription.unsubscribe();window.removeEventListener("focus",update);window.removeEventListener("formai-credits-changed",update);};
  },[refresh]);
  return {credits,signedIn,vip,loading,error,reviewCredits,sandboxCredits,refresh,consume:refresh};
}

