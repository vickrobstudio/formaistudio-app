
-- 1) design_proposals: prevent users from toggling is_paid via a trigger.
CREATE OR REPLACE FUNCTION public.prevent_is_paid_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_paid IS DISTINCT FROM OLD.is_paid THEN
    -- Allow service_role (privileged backend) to change is_paid; block everyone else.
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'is_paid can only be changed by privileged backend code';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS design_proposals_protect_is_paid ON public.design_proposals;
CREATE TRIGGER design_proposals_protect_is_paid
BEFORE UPDATE ON public.design_proposals
FOR EACH ROW
EXECUTE FUNCTION public.prevent_is_paid_change();

-- 2) guest_credit_claims: revoke UPDATE/DELETE from client roles so users
--    can never modify their own credit balance directly. Service role retains full access.
REVOKE UPDATE, DELETE ON public.guest_credit_claims FROM authenticated;
REVOKE UPDATE, DELETE ON public.guest_credit_claims FROM anon;
