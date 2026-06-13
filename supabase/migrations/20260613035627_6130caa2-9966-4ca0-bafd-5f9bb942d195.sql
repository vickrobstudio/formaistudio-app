CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  company_name text,
  email text,
  has_free_access boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Members create their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id AND has_free_access = false);
CREATE POLICY "Members update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Members delete their own profile" ON public.profiles FOR DELETE TO authenticated USING (auth.uid() = id);
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.design_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Untitled design',
  room_type text NOT NULL DEFAULT 'Living Room',
  room_width numeric NOT NULL DEFAULT 5 CHECK (room_width > 0),
  room_length numeric NOT NULL DEFAULT 5 CHECK (room_length > 0),
  room_height numeric NOT NULL DEFAULT 3 CHECK (room_height > 0),
  dimension_unit text NOT NULL DEFAULT 'meters' CHECK (dimension_unit IN ('meters','feet')),
  style text NOT NULL DEFAULT 'brand-defined',
  color_palette jsonb NOT NULL DEFAULT '[]'::jsonb,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  finishes jsonb NOT NULL DEFAULT '[]'::jsonb,
  existing_finishes jsonb NOT NULL DEFAULT '[]'::jsonb,
  space_use text,
  selected_brands jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_brands jsonb NOT NULL DEFAULT '[]'::jsonb,
  budget numeric CHECK (budget IS NULL OR budget >= 0),
  existing_plan_url text,
  input_type text NOT NULL DEFAULT '2d' CHECK (input_type IN ('2d','3d','photo')),
  sketchup_file_url text,
  ai_prompt text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generating','completed','failed')),
  source_feature text NOT NULL DEFAULT 'studio_ai' CHECK (source_feature IN ('studio_ai','model_to_ai','photo_to_ai','ai_edits')),
  rendering_urls jsonb NOT NULL DEFAULT '{}'::jsonb,
  furniture_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_paid boolean NOT NULL DEFAULT false,
  is_saved boolean NOT NULL DEFAULT false,
  saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.design_proposals TO authenticated;
GRANT ALL ON public.design_proposals TO service_role;
ALTER TABLE public.design_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own designs" ON public.design_proposals FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members create their own designs" ON public.design_proposals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND is_paid = false);
CREATE POLICY "Members update their own designs" ON public.design_proposals FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members delete their own designs" ON public.design_proposals FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX design_proposals_user_created_idx ON public.design_proposals (user_id, created_at DESC);
CREATE TRIGGER design_proposals_set_updated_at BEFORE UPDATE ON public.design_proposals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.product_tearsheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  category text,
  subcategory text,
  designer text,
  product_url text,
  shape_description text,
  visual_blueprint text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  materials jsonb NOT NULL DEFAULT '[]'::jsonb,
  colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  fabric_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  finishes jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  reference_image_url text,
  floor_plan_url text,
  floor_plan_uploaded_at timestamptz,
  tearsheet_pdf_url text,
  parsed_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_tearsheets TO authenticated;
GRANT ALL ON public.product_tearsheets TO service_role;
ALTER TABLE public.product_tearsheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members browse verified products" ON public.product_tearsheets FOR SELECT TO authenticated USING (is_verified = true);
CREATE INDEX product_tearsheets_verified_category_idx ON public.product_tearsheets (is_verified, category);
CREATE TRIGGER product_tearsheets_set_updated_at BEFORE UPDATE ON public.product_tearsheets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.feature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_type text NOT NULL CHECK (feature_type IN ('studio_ai','3d_to_ai','ai_edits','photo_to_ai','ai_to_video')),
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature_type)
);
GRANT SELECT ON public.feature_usage TO authenticated;
GRANT ALL ON public.feature_usage TO service_role;
ALTER TABLE public.feature_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own usage" ON public.feature_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER feature_usage_set_updated_at BEFORE UPDATE ON public.feature_usage FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rule text NOT NULL CHECK (char_length(rule) BETWEEN 1 AND 2000),
  scope text NOT NULL DEFAULT 'global',
  category text NOT NULL DEFAULT 'general',
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_global boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_decision text,
  reviewed_at timestamptz,
  submitted_by_email text,
  ai_passed boolean,
  ai_score integer CHECK (ai_score IS NULL OR ai_score BETWEEN 0 AND 100),
  ai_review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_rules TO authenticated;
GRANT ALL ON public.ai_rules TO service_role;
ALTER TABLE public.ai_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view own and approved global rules" ON public.ai_rules FOR SELECT TO authenticated USING (auth.uid() = user_id OR (is_global = true AND status = 'approved' AND is_active = true));
CREATE POLICY "Members create their own pending rules" ON public.ai_rules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND is_global = false AND status = 'pending');
CREATE POLICY "Members update their own unapproved rules" ON public.ai_rules FOR UPDATE TO authenticated USING (auth.uid() = user_id AND is_global = false AND status <> 'approved') WITH CHECK (auth.uid() = user_id AND is_global = false AND status <> 'approved');
CREATE POLICY "Members delete their own unapproved rules" ON public.ai_rules FOR DELETE TO authenticated USING (auth.uid() = user_id AND is_global = false AND status <> 'approved');
CREATE TRIGGER ai_rules_set_updated_at BEFORE UPDATE ON public.ai_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  proposal_id uuid,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 40),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.contact_requests TO anon, authenticated;
GRANT SELECT ON public.contact_requests TO authenticated;
GRANT ALL ON public.contact_requests TO service_role;
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visitors submit contact requests" ON public.contact_requests FOR INSERT TO anon WITH CHECK (user_id IS NULL);
CREATE POLICY "Members submit their own contact requests" ON public.contact_requests FOR INSERT TO authenticated WITH CHECK (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Members view their own contact requests" ON public.contact_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.iap_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entitlement_id text NOT NULL,
  product_id text NOT NULL,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entitlement_id, product_id)
);
GRANT SELECT ON public.iap_entitlements TO authenticated;
GRANT ALL ON public.iap_entitlements TO service_role;
ALTER TABLE public.iap_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own purchase access" ON public.iap_entitlements FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX iap_entitlements_user_active_idx ON public.iap_entitlements (user_id, is_active);
CREATE TRIGGER iap_entitlements_set_updated_at BEFORE UPDATE ON public.iap_entitlements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  subscription_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','trialing','past_due','canceled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own subscription" ON public.user_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER user_subscriptions_set_updated_at BEFORE UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_cloud_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tool text NOT NULL CHECK (tool IN ('studio_ai','model_to_ai','photo_to_ai','ai_edits','ai_to_video')),
  kind text NOT NULL CHECK (kind IN ('image','video','document','archive')),
  storage_path text NOT NULL,
  source_url text,
  filename text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.user_cloud_outputs TO authenticated;
GRANT ALL ON public.user_cloud_outputs TO service_role;
ALTER TABLE public.user_cloud_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own cloud files" ON public.user_cloud_outputs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members register their own cloud files" ON public.user_cloud_outputs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members delete their own cloud files" ON public.user_cloud_outputs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX user_cloud_outputs_user_created_idx ON public.user_cloud_outputs (user_id, created_at DESC);