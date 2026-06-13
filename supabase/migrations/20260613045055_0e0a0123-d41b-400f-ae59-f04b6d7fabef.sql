DROP POLICY IF EXISTS "Members update their own profile" ON public.profiles;

CREATE POLICY "Members update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND has_free_access = (lower(coalesce(auth.jwt() ->> 'email', '')) = 'hello@vickrob.com')
);