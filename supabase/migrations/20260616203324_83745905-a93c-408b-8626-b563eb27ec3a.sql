
CREATE OR REPLACE FUNCTION public.prevent_is_paid_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_paid IS DISTINCT FROM OLD.is_paid THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'is_paid can only be changed by privileged backend code';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_is_paid_change() FROM PUBLIC, anon, authenticated;
