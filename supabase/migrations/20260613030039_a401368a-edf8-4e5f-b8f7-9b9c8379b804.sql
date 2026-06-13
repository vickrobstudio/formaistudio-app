CREATE TABLE public.studio_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled project' CHECK (char_length(name) BETWEEN 1 AND 120),
  mode TEXT NOT NULL DEFAULT 'render' CHECK (mode IN ('render', '3d')),
  prompt TEXT NOT NULL DEFAULT '' CHECK (char_length(prompt) <= 2000),
  source_image_url TEXT,
  render_image_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studio_projects TO authenticated;
GRANT ALL ON public.studio_projects TO service_role;
ALTER TABLE public.studio_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creators can view their own projects" ON public.studio_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Creators can create their own projects" ON public.studio_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Creators can update their own projects" ON public.studio_projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Creators can delete their own projects" ON public.studio_projects FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.set_studio_project_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_studio_projects_updated_at
BEFORE UPDATE ON public.studio_projects
FOR EACH ROW EXECUTE FUNCTION public.set_studio_project_updated_at();