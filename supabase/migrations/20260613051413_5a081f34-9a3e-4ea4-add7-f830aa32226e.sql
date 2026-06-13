ALTER TABLE public.profiles
ADD COLUMN starter_credits integer NOT NULL DEFAULT 4 CHECK (starter_credits >= 0 AND starter_credits <= 4);

CREATE TABLE public.photo_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.photo_ai_messages TO authenticated;
GRANT ALL ON public.photo_ai_messages TO service_role;
ALTER TABLE public.photo_ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own Photo AI messages"
ON public.photo_ai_messages FOR SELECT TO authenticated
USING (auth.uid() = user_id);
CREATE POLICY "Members add their own Photo AI messages"
ON public.photo_ai_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members clear their own Photo AI messages"
ON public.photo_ai_messages FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_my_starter_credits()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE WHEN has_free_access THEN 2147483647 ELSE starter_credits END
  FROM public.profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.consume_starter_credit()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
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

GRANT EXECUTE ON FUNCTION public.get_my_starter_credits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_starter_credit() TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_starter_credits() FROM anon;
REVOKE ALL ON FUNCTION public.consume_starter_credit() FROM anon;