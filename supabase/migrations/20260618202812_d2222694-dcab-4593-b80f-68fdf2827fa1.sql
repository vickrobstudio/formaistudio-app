
UPDATE public.profiles
SET has_free_access = true,
    updated_at = now()
WHERE lower(email) = 'tserodis@gmail.com';

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  base_username text;
  generated_username text;
  vip_emails text[] := ARRAY['hello@vickrob.com','tetiana.shanina@gmail.com','tserodis@gmail.com'];
BEGIN
  base_username := regexp_replace(
    regexp_replace(lower(COALESCE(NULLIF(split_part(NEW.email, '@', 1), ''), 'member')), '[^a-z0-9.-]+', '-', 'g'),
    '^[.-]+|[.-]+$', '', 'g'
  );
  IF length(base_username) < 2 THEN
    base_username := 'member';
  END IF;
  generated_username := left(base_username, 20) || '-' || substr(replace(NEW.id::text, '-', ''), 1, 6);

  INSERT INTO public.profiles (id, email, full_name, has_free_access, username)
  VALUES (
    NEW.id,
    lower(NEW.email),
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), ''),
    lower(NEW.email) = ANY(vip_emails),
    generated_username
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      has_free_access = public.profiles.has_free_access OR EXCLUDED.has_free_access,
      updated_at = now();
  RETURN NEW;
END;
$function$;
