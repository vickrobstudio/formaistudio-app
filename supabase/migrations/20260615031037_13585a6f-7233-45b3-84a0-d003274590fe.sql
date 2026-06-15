ALTER TABLE public.ai_rules DROP COLUMN IF EXISTS submitted_by_email;

DROP POLICY IF EXISTS "Members update their own designs" ON public.design_proposals;
CREATE POLICY "Members update their own designs"
ON public.design_proposals
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id AND is_paid = false);

REVOKE UPDATE ON public.design_proposals FROM authenticated;
GRANT UPDATE (
  name, room_type, room_width, room_length, room_height, dimension_unit,
  style, color_palette, materials, finishes, existing_finishes, space_use,
  selected_brands, custom_brands, budget, existing_plan_url, input_type,
  sketchup_file_url, ai_prompt, status, source_feature, rendering_urls,
  furniture_suggestions, is_saved, saved_at, updated_at
) ON public.design_proposals TO authenticated;

DROP POLICY IF EXISTS "Members update their own profile" ON public.profiles;
CREATE POLICY "Members update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND has_free_access = (lower(coalesce(auth.jwt() ->> 'email', '')) = 'hello@vickrob.com')
  AND starter_credits BETWEEN 0 AND 4
);

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, company_name, updated_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_starter_credit()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
  free_access boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT has_free_access INTO free_access
  FROM public.profiles
  WHERE id = auth.uid();

  IF free_access THEN
    RETURN 2147483647;
  END IF;

  UPDATE public.profiles
  SET starter_credits = starter_credits - 1,
      updated_at = now()
  WHERE id = auth.uid() AND starter_credits > 0
  RETURNING starter_credits INTO remaining;

  IF remaining IS NULL THEN
    RAISE EXCEPTION 'No credits remaining';
  END IF;

  RETURN remaining;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_starter_credit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_starter_credit() TO authenticated, service_role;

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
REVOKE ALL ON FUNCTION public.activate_vip_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_vip_access() TO authenticated, service_role;

DROP POLICY IF EXISTS "Members create their own guest credit claim" ON public.guest_credit_claims;
CREATE POLICY "Members create valid own guest credit claim"
ON public.guest_credit_claims
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND remaining_credits BETWEEN 0 AND 4
);