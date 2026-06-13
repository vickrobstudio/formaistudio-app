REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, company_name, email, updated_at) ON public.profiles TO authenticated;

REVOKE UPDATE ON public.design_proposals FROM authenticated;
GRANT UPDATE (name, room_type, room_width, room_length, room_height, dimension_unit, style, color_palette, materials, finishes, existing_finishes, space_use, selected_brands, custom_brands, budget, existing_plan_url, input_type, sketchup_file_url, ai_prompt, status, source_feature, rendering_urls, furniture_suggestions, is_saved, saved_at, updated_at) ON public.design_proposals TO authenticated;