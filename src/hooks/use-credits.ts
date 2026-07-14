import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGuestCredits, spendGuestCredit } from "@/lib/guest-trial";
import { supabase } from "@/integrations/supabase/client";
import { consumeAccountCredit } from "@/lib/credits.functions";
import { hasActiveIapEntitlement, isNativeIOS } from "@/lib/iap";

export function useCredits() {
  const consumeAccountCreditFn = useServerFn(consumeAccountCredit);
  const [credits, setCredits] = useState(4);
  const [signedIn, setSignedIn] = useState(false);
  const [vip, setVip] = useState(false);

  useEffect(() => {
    void (async () => {
      // A subscription bought on this device unlocks everything even without
      // an account — so members are never forced to register to use what
      // they paid for (Apple 5.1.1). Login only adds cross-device sync.
      const deviceSub = isNativeIOS() ? await hasActiveIapEntitlement() : false;
      const { data } = await supabase.auth.getUser();
      if (!data.user) { setCredits(getGuestCredits()); if (deviceSub) setVip(true); return; }
      setSignedIn(true);
      const { data: profile } = await supabase.from("profiles").select("starter_credits, has_free_access").eq("id", data.user.id).single();
      if (profile) { setCredits(profile.starter_credits); setVip(profile.has_free_access || deviceSub); }
      else if (deviceSub) setVip(true);
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