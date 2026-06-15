CREATE TABLE public.public_creations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  creator_name text NOT NULL CHECK (char_length(creator_name) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  image_url text NOT NULL CHECK (char_length(image_url) BETWEEN 1 AND 8000000),
  creation_type text NOT NULL CHECK (creation_type IN ('furniture', 'interior', 'render', 'video', 'other')),
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.public_creations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.public_creations TO authenticated;
GRANT ALL ON public.public_creations TO service_role;
ALTER TABLE public.public_creations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view public creations" ON public.public_creations FOR SELECT TO anon, authenticated USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Members create their own creations" ON public.public_creations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Creators update their own creations" ON public.public_creations FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Creators delete their own creations" ON public.public_creations FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_public_creations_updated_at BEFORE UPDATE ON public.public_creations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX public_creations_public_created_idx ON public.public_creations (created_at DESC) WHERE is_public = true;

CREATE TABLE public.creation_likes (
  creation_id uuid NOT NULL REFERENCES public.public_creations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creation_id, user_id)
);
GRANT SELECT ON public.creation_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.creation_likes TO authenticated;
GRANT ALL ON public.creation_likes TO service_role;
ALTER TABLE public.creation_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view likes on public creations" ON public.creation_likes FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.public_creations c WHERE c.id = creation_id AND c.is_public = true));
CREATE POLICY "Members like public creations" ON public.creation_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.public_creations c WHERE c.id = creation_id AND c.is_public = true));
CREATE POLICY "Members remove their own likes" ON public.creation_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.creation_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creation_id uuid NOT NULL REFERENCES public.public_creations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 80),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.creation_comments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.creation_comments TO authenticated;
GRANT ALL ON public.creation_comments TO service_role;
ALTER TABLE public.creation_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view comments on public creations" ON public.creation_comments FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.public_creations c WHERE c.id = creation_id AND c.is_public = true));
CREATE POLICY "Members comment on public creations" ON public.creation_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.public_creations c WHERE c.id = creation_id AND c.is_public = true));
CREATE POLICY "Members update their own comments" ON public.creation_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members delete their own comments" ON public.creation_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER set_creation_comments_updated_at BEFORE UPDATE ON public.creation_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX creation_comments_creation_created_idx ON public.creation_comments (creation_id, created_at);

CREATE TABLE public.creation_favorites (
  creation_id uuid NOT NULL REFERENCES public.public_creations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (creation_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.creation_favorites TO authenticated;
GRANT ALL ON public.creation_favorites TO service_role;
ALTER TABLE public.creation_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view their own favorites" ON public.creation_favorites FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Members save public creations" ON public.creation_favorites FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.public_creations c WHERE c.id = creation_id AND c.is_public = true));
CREATE POLICY "Members remove their own favorites" ON public.creation_favorites FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX creation_favorites_user_created_idx ON public.creation_favorites (user_id, created_at DESC);