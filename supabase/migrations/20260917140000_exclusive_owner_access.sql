begin;
select set_config('request.jwt.claim.role','service_role',true);
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  base_username text;
  generated_username text;
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
    NEW.id = '13cf24b3-daa6-4584-8ee1-a397cff9152e'::uuid AND lower(NEW.email) = 'hello@vickrob.com' AND NEW.email_confirmed_at IS NOT NULL,
    generated_username
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
      has_free_access = EXCLUDED.has_free_access,
      updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_formai_owner_vip()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.has_free_access AND NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = NEW.id
    AND u.id = '13cf24b3-daa6-4584-8ee1-a397cff9152e'::uuid
    AND lower(u.email) = 'hello@vickrob.com' AND u.email_confirmed_at IS NOT NULL
  ) THEN NEW.has_free_access := false; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_formai_owner_vip() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER profiles_enforce_owner_vip
BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_formai_owner_vip();
UPDATE public.profiles SET has_free_access = false, updated_at = now()
WHERE has_free_access AND id <> '13cf24b3-daa6-4584-8ee1-a397cff9152e'::uuid;
commit;
