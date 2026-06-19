
-- 1. Remove overlapping contact_requests INSERT policy that allowed authenticated users to insert with NULL user_id
DROP POLICY IF EXISTS "Members submit their own contact requests" ON public.contact_requests;

-- 2. Prevent users from changing their own starter_credits via the Data API.
CREATE OR REPLACE FUNCTION public.prevent_starter_credits_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.starter_credits IS DISTINCT FROM OLD.starter_credits THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'starter_credits can only be changed by privileged backend code';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_starter_credits_self_update ON public.profiles;
CREATE TRIGGER prevent_starter_credits_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_starter_credits_self_update();
