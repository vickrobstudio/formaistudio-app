REVOKE UPDATE ON public.profiles FROM authenticated;

CREATE OR REPLACE FUNCTION public.save_guest_credit_balance(_remaining integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved integer;
BEGIN
  IF auth.uid() IS NULL OR _remaining < 0 OR _remaining > 4 THEN
    RAISE EXCEPTION 'Invalid credit balance';
  END IF;

  UPDATE public.profiles
  SET starter_credits = LEAST(starter_credits, _remaining),
      updated_at = now()
  WHERE id = auth.uid()
  RETURNING starter_credits INTO saved;

  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_guest_credit_balance(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_guest_credit_balance(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_guest_credit_balance(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_profile_name(_full_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR char_length(trim(_full_name)) > 100 THEN
    RAISE EXCEPTION 'Invalid profile name';
  END IF;
  UPDATE public.profiles SET full_name = NULLIF(trim(_full_name), ''), updated_at = now() WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile_name(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_profile_name(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile_name(text) TO authenticated;