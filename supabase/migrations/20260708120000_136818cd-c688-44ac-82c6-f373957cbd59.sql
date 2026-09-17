-- Fix: no member has ever been able to update their own username or
-- profile photo. The original table-wide UPDATE grant on public.profiles
-- was revoked and replaced with an explicit per-column allowlist back on
-- 2026-06-13 (full_name, company_name, updated_at) — but the username and
-- avatar_path columns weren't added until 2026-06-15, after that allowlist
-- was set, so they were simply never included in it. Every UPDATE hits
-- Postgres error 42501 "permission denied for table profiles" before RLS
-- is even evaluated. Add the missing column grants.
GRANT UPDATE (username, avatar_path) ON public.profiles TO authenticated;
