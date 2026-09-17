import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getCreditAccount } from "@/lib/credits.functions";

export function useCredits() {
  const readAccount = useServerFn(getCreditAccount);
  const [credits,setCredits] = useState(0);
  const [signedIn,setSignedIn] = useState(false);
  const [vip,setVip] = useState(false);
  const refresh = useCallback(async () => {
    const {data} = await supabase.auth.getSession();
    setSignedIn(!!data.session && !data.session.user.is_anonymous);
    if (!data.session) {setCredits(0);setVip(false);return false;}
    try {const account=await readAccount();setCredits(account.credits);setVip(account.owner);return account.owner || account.credits>0;}
    catch {setCredits(0);setVip(false);return false;}
  },[readAccount]);
  useEffect(()=>{
    const update=()=>{void refresh();};update();
    const {data}=supabase.auth.onAuthStateChange(()=>{queueMicrotask(update);});
    window.addEventListener("focus",update);window.addEventListener("formai-credits-changed",update);
    return ()=>{data.subscription.unsubscribe();window.removeEventListener("focus",update);window.removeEventListener("formai-credits-changed",update);};
  },[refresh]);
  return {credits,signedIn,vip,consume:refresh};
}
