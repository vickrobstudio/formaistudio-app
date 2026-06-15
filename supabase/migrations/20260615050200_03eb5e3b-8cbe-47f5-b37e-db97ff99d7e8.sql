DROP POLICY IF EXISTS "Members update their own profile" ON public.profiles;
CREATE POLICY "Members update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND has_free_access = (lower(COALESCE(auth.jwt() ->> 'email', '')) = 'hello@vickrob.com')
  AND starter_credits >= 0
  AND starter_credits <= 4
);