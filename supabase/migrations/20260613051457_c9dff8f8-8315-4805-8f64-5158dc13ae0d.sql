DROP FUNCTION IF EXISTS public.save_guest_credit_balance(integer);
DROP FUNCTION IF EXISTS public.update_my_profile_name(text);

GRANT UPDATE (full_name, company_name) ON public.profiles TO authenticated;

CREATE TABLE public.guest_credit_claims (
  user_id uuid PRIMARY KEY,
  remaining_credits integer NOT NULL CHECK (remaining_credits >= 0 AND remaining_credits <= 4),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.guest_credit_claims TO authenticated;
GRANT ALL ON public.guest_credit_claims TO service_role;
ALTER TABLE public.guest_credit_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own guest credit claim"
ON public.guest_credit_claims FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Members create their own guest credit claim"
ON public.guest_credit_claims FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.apply_guest_credit_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET starter_credits = LEAST(starter_credits, NEW.remaining_credits),
      updated_at = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_guest_credit_claim() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_guest_credit_claim() FROM anon;
REVOKE ALL ON FUNCTION public.apply_guest_credit_claim() FROM authenticated;
CREATE TRIGGER apply_guest_credit_claim_after_insert
AFTER INSERT ON public.guest_credit_claims
FOR EACH ROW EXECUTE FUNCTION public.apply_guest_credit_claim();