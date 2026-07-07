-- Per-user Instagram connection (Facebook Login for Business OAuth), so
-- members can share their creations straight to their own Instagram
-- Business/Creator account via the Instagram Graph API.
CREATE TABLE public.instagram_connections (
  user_id uuid PRIMARY KEY,
  ig_user_id text NOT NULL,
  ig_username text NOT NULL CHECK (char_length(ig_username) BETWEEN 1 AND 80),
  page_id text NOT NULL,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- access_token never reaches the client: the RLS-scoped user client is only
-- ever queried for non-secret columns (see instagram-connect.functions.ts).
-- INSERT/UPDATE grants + policies for authenticated are added in the next
-- migration so the connect flow never needs the service-role key.
GRANT SELECT, DELETE ON public.instagram_connections TO authenticated;
GRANT ALL ON public.instagram_connections TO service_role;
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own Instagram connection" ON public.instagram_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members remove their own Instagram connection" ON public.instagram_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_instagram_connections_updated_at BEFORE UPDATE ON public.instagram_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
