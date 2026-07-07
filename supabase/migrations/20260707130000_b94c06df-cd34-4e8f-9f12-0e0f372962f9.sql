-- Let members write their own Instagram connection row directly (RLS-scoped
-- client, authenticated JWT) instead of requiring the service-role key —
-- the OAuth callback now completes inside an authenticated server function.
GRANT INSERT, UPDATE ON public.instagram_connections TO authenticated;
CREATE POLICY "Members create their own Instagram connection" ON public.instagram_connections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members update their own Instagram connection" ON public.instagram_connections FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
