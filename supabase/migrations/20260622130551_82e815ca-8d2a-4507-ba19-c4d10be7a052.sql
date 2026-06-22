
-- 1. Drop duplicate anon INSERT policy on contact_requests
DROP POLICY IF EXISTS "Anon create contact requests" ON public.contact_requests;

-- 2. Tighten design_proposals UPDATE policy; trigger prevent_is_paid_change enforces is_paid immutability
DROP POLICY IF EXISTS "Members update their own designs" ON public.design_proposals;
CREATE POLICY "Members update their own designs"
  ON public.design_proposals
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Tighten profiles UPDATE policy; trigger prevent_starter_credits_self_update enforces credit immutability
DROP POLICY IF EXISTS "Members update their own profile" ON public.profiles;
CREATE POLICY "Members update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND has_free_access = (lower(COALESCE((auth.jwt() ->> 'email'), '')) = 'hello@vickrob.com')
  );
