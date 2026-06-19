
-- 1) Deduplicate existing guest_credit_claims, keep the row with the lowest remaining_credits (most consumed)
DELETE FROM public.guest_credit_claims a
USING public.guest_credit_claims b
WHERE a.user_id = b.user_id
  AND (a.remaining_credits, a.ctid) > (b.remaining_credits, b.ctid);

ALTER TABLE public.guest_credit_claims
  ADD CONSTRAINT guest_credit_claims_user_id_unique UNIQUE (user_id);

-- 2) Contact requests: replace permissive INSERT policy and add owner DELETE policy
DROP POLICY IF EXISTS "Anyone can create contact requests" ON public.contact_requests;
DROP POLICY IF EXISTS "Members create their own contact requests" ON public.contact_requests;
DROP POLICY IF EXISTS "Anon can create contact requests" ON public.contact_requests;
DROP POLICY IF EXISTS "Authenticated create own contact requests" ON public.contact_requests;
DROP POLICY IF EXISTS "Members delete their own contact requests" ON public.contact_requests;

CREATE POLICY "Anon create contact requests"
  ON public.contact_requests
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "Authenticated create own contact requests"
  ON public.contact_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Members delete their own contact requests"
  ON public.contact_requests
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
