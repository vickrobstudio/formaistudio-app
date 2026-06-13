DROP POLICY IF EXISTS "Members update their own profile" ON public.profiles;

CREATE POLICY "Members update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND has_free_access = (SELECT p.has_free_access FROM public.profiles AS p WHERE p.id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.activate_vip_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email text;
BEGIN
  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  IF auth.uid() IS NULL OR caller_email <> 'hello@vickrob.com' THEN
    RETURN false;
  END IF;

  INSERT INTO public.profiles (id, email, has_free_access)
  VALUES (auth.uid(), caller_email, true)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      has_free_access = true,
      updated_at = now();

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_vip_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_vip_access() TO authenticated;