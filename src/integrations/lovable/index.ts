import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type SupportedProvider = "google" | "apple" | "microsoft";

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: SupportedProvider,
      opts?: SignInOptions,
    ) => {
      const supabaseProvider =
        provider === "microsoft" ? "azure" : provider;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: supabaseProvider,
        options: {
          redirectTo: opts?.redirect_uri,
          queryParams: opts?.extraParams,
        },
      });

      if (error) {
        return { error };
      }

      return {
        redirected: true,
        url: data.url,
      };
    },
  },
};
