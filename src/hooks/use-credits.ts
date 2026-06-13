import { useEffect, useState } from "react";
import { getGuestCredits, spendGuestCredit } from "@/lib/guest-trial";
import { supabase } from "@/integrations/supabase/client";

export function useCredits() {
  const [credits, setCredits] = useState(4);
  const [signedIn, setSignedIn] = useState(false);
  const [vip, setVip] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setCredits(getGuestCredits()); return; }
      setSignedIn(true);
      const { data: profile } = await supabase.from("profiles").select("starter_credits, has_free_access").eq("id", data.user.id).single();
      if (profile) { setCredits(profile.starter_credits); setVip(profile.has_free_access); }
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
    const { data, error } = await supabase.rpc("consume_starter_credit");
    if (error || data === null) return false;
    setCredits(data);
    return true;
  }

  return { credits, signedIn, vip, consume };
}