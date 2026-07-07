import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyInstagramConnection } from "@/lib/instagram-connect.functions";

export function useInstagramConnection() {
  const getConnection = useServerFn(getMyInstagramConnection);
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      try {
        const result = await getConnection();
        setConnected(result.connected);
        setUsername(result.username);
      } catch { /* not signed in yet, or check failed — leave disconnected */ }
    })();
  }, []);

  return { connected, username };
}
