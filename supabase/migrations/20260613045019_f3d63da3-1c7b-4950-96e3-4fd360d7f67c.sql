DROP FUNCTION IF EXISTS public.activate_vip_access();

DROP POLICY IF EXISTS "Members create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Members update their own profile" ON public.profiles;

CREATE POLICY "Members create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND has_free_access = (lower(coalesce(auth.jwt() ->> 'email', '')) = 'hello@vickrob.com')
);

CREATE POLICY "Members update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND has_free_access = CASE
    WHEN lower(coalesce(auth.jwt() ->> 'email', '')) = 'hello@vickrob.com' THEN true
    ELSE (SELECT p.has_free_access FROM public.profiles AS p WHERE p.id = auth.uid())
  END
);

CREATE OR REPLACE FUNCTION public.activate_vip_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
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