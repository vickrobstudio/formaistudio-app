import { isFormAIOwner } from "@/lib/owner-access";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGuestCredits, spendGuestCredit } from "@/lib/guest-trial";
import { supabase } from "@/integrations/supabase/client";
import { consumeAccountCredit } from "@/lib/credits.functions";

export function useCredits() {
  const consumeAccountCreditFn = useServerFn(consumeAccountCredit);
  const [credits, setCredits] = useState(4);
  const [signedIn, setSignedIn] = useState(false);
  const [vip, setVip] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setCredits(getGuestCredits()); return; }
      setSignedIn(true);
      const { data: profile } = await supabase.from("profiles").select("starter_credits, has_free_access").eq("id", data.user.id).single();
      if (profile) { setCredits(profile.starter_credits); setVip(isFormAIOwner(data.user)); }
    })();
  }, []);

  async function consume() {
    if (vip) return true;
    if (!signedIn) {
      const remaining = spendGuestCredit();
      if (remaining === null) return false;
      setCredits(remaining);
      return true;
    }
    try {
      const { remaining } = await consumeAccountCreditFn();
      setCredits(remaining);
      return true;
    } catch {
      return false;
    }
  }

  return { credits, signedIn, vip, consume };
}