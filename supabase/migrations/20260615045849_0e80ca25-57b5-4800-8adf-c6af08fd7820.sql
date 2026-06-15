ALTER TABLE public.profiles
  ADD COLUMN username text,
  ADD COLUMN avatar_path text;

UPDATE public.profiles
SET username = left(
  regexp_replace(
    regexp_replace(lower(COALESCE(NULLIF(split_part(email, '@', 1), ''), 'member')), '[^a-z0-9.-]+', '-', 'g'),
    '^[.-]+|[.-]+$', '', 'g'
  ),
  20
) || '-' || substr(replace(id::text, '-', ''), 1, 6)
WHERE username IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL,
  ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[A-Za-z0-9][A-Za-z0-9.-]{1,28}[A-Za-z0-9]$'),
  ADD CONSTRAINT profiles_avatar_path_owner CHECK (avatar_path IS NULL OR avatar_path = id::text || '/profile/avatar');

CREATE UNIQUE INDEX profiles_username_unique_ci ON public.profiles (lower(username));

DROP POLICY IF EXISTS "Members update their own profile" ON public.profiles;
CREATE POLICY "Members update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND has_free_access = (lower(COALESCE(auth.jwt() ->> 'email', '')) = 'hello@vickrob.com')
  AND starter_credits = (SELECT p.starter_credits FROM public.profiles p WHERE p.id = auth.uid())
);

COMMENT ON COLUMN public.profiles.username IS 'Unique public creator username shown on shared creations.';
COMMENT ON COLUMN public.profiles.avatar_path IS 'Private user-outputs storage path for the member profile photo.';