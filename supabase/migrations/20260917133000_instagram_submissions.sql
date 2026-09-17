begin;
create table if not exists public.instagram_submissions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 120),
  caption text not null check (char_length(caption) between 1 and 2200),
  image_data_url text not null check (char_length(image_data_url) between 1 and 3000000 and image_data_url like 'data:image/jpeg;base64,%'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','publishing','published','needs_review')),
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  published_at timestamptz,
  container_id text,
  instagram_media_id text
);
alter table public.instagram_submissions enable row level security;
revoke all on public.instagram_submissions from anon, authenticated;
grant select on public.instagram_submissions to authenticated;
grant insert (id,user_id,title,caption,image_data_url) on public.instagram_submissions to authenticated;
grant all on public.instagram_submissions to service_role;
create policy "Owners read Instagram submissions" on public.instagram_submissions for select to authenticated using (auth.uid()=user_id);
create policy "Owners submit pending Instagram creations" on public.instagram_submissions for insert to authenticated with check (auth.uid()=user_id and status='pending');
create index instagram_submissions_queue on public.instagram_submissions(status,created_at);
commit;

