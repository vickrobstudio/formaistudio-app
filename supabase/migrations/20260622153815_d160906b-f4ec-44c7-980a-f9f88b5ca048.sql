-- Replace profiles INSERT/UPDATE policies: remove hardcoded VIP email JWT check.
-- has_free_access is granted by the SECURITY DEFINER signup trigger and managed by service_role only.
DROP POLICY IF EXISTS "Members create their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Members update their own profile" ON public.profiles;

CREATE POLICY "Members create their own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id AND has_free_access = false);

CREATE POLICY "Members update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Trigger: block non-service_role changes to has_free_access (mirrors prevent_is_paid_change pattern).
CREATE OR REPLACE FUNCTION public.prevent_has_free_access_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.has_free_access IS DISTINCT FROM OLD.has_free_access THEN
    IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
       AND (auth.jwt() ->> 'role') IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'has_free_access can only be changed by privileged backend code';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_has_free_access ON public.profiles;
CREATE TRIGGER profiles_protect_has_free_access
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_has_free_access_self_update();