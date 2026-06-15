DROP FUNCTION IF EXISTS public.consume_starter_credit();
DROP FUNCTION IF EXISTS public.activate_vip_access();

CREATE OR REPLACE FUNCTION public.consume_starter_credit_for_user(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
  free_access boolean;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User required';
  END IF;

  SELECT has_free_access INTO free_access
  FROM public.profiles
  WHERE id = _user_id;

  IF free_access THEN
    RETURN 2147483647;
  END IF;

  UPDATE public.profiles
  SET starter_credits = starter_credits - 1,
      updated_at = now()
  WHERE id = _user_id AND starter_credits > 0
  RETURNING starter_credits INTO remaining;

  IF remaining IS NULL THEN
    RAISE EXCEPTION 'No credits remaining';
  END IF;

  RETURN remaining;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_starter_credit_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_starter_credit_for_user(uuid) TO service_role;