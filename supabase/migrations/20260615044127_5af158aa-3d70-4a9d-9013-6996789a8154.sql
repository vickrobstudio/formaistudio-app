ALTER TABLE public.public_creations
  ADD COLUMN model_glb_path TEXT,
  ADD COLUMN model_usdz_path TEXT;

COMMENT ON COLUMN public.public_creations.model_glb_path IS 'Private user-outputs storage path for the rotatable GLB furniture model.';
COMMENT ON COLUMN public.public_creations.model_usdz_path IS 'Private user-outputs storage path for the downloadable USDZ furniture model.';