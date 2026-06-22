create extension if not exists pgcrypto;

create table if not exists public.painting_walls (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default 'Painting Room',
  canvas_json jsonb not null default '{}'::jsonb,
  preview_image_url text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = uid
  );
$$;

create table if not exists public.painting_snapshots (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid references public.painting_walls(id) on delete cascade,
  title text,
  image_url text,
  canvas_json jsonb not null default '{}'::jsonb,
  wall_version integer,
  created_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.painting_snapshots
  alter column canvas_json set default '{}'::jsonb;
alter table public.painting_snapshots
  alter column canvas_json set not null;
alter table public.painting_snapshots
  add column if not exists wall_version integer;
alter table public.painting_snapshots
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.painting_snapshots
  add column if not exists reason text;

create table if not exists public.painting_assets (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid references public.painting_walls(id) on delete cascade,
  file_path text not null,
  public_url text not null,
  width integer,
  height integer,
  file_type text,
  created_by uuid references auth.users(id) on delete set null,
  moderation_status text not null default 'active',
  hidden boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.painting_assets
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.painting_assets
  add column if not exists moderation_status text not null default 'active';
alter table public.painting_assets
  add column if not exists hidden boolean not null default false;
alter table public.painting_assets
  add column if not exists deleted_at timestamptz;

create table if not exists public.painting_reports (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid references public.painting_walls(id) on delete cascade,
  object_id text,
  reason text not null,
  comment text,
  snapshot_id uuid references public.painting_snapshots(id) on delete set null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_session_id text,
  status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_logs (
  id uuid primary key default gen_random_uuid(),
  wall_id uuid references public.painting_walls(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.painting_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id text,
  reason text,
  banned_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  actor_id text not null,
  action text not null,
  count integer not null default 1,
  window_start timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(bucket, actor_id, action, window_start)
);

insert into public.painting_walls (slug, title, canvas_json)
values ('main', 'Painting Room', '{"version":"5.3.0","objects":[]}'::jsonb)
on conflict (slug) do nothing;

alter table public.painting_walls enable row level security;
alter table public.admin_users enable row level security;
alter table public.painting_snapshots enable row level security;
alter table public.painting_assets enable row level security;
alter table public.painting_reports enable row level security;
alter table public.moderation_logs enable row level security;
alter table public.painting_bans enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists "Anyone can read painting walls" on public.painting_walls;
create policy "Anyone can read painting walls"
on public.painting_walls
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can update painting walls" on public.painting_walls;
create policy "Admins can update painting walls"
on public.painting_walls
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can read their admin row" on public.admin_users;
create policy "Users can read their admin row"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Admins can manage admin users" on public.admin_users;
create policy "Admins can manage admin users"
on public.admin_users
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Anyone can read painting snapshots" on public.painting_snapshots;
create policy "Anyone can read painting snapshots"
on public.painting_snapshots
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can delete painting snapshots" on public.painting_snapshots;
create policy "Admins can delete painting snapshots"
on public.painting_snapshots
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Anyone can read painting assets" on public.painting_assets;
create policy "Anyone can read painting assets"
on public.painting_assets
for select
to anon, authenticated
using (true);

drop policy if exists "Authenticated users can create painting assets" on public.painting_assets;
create policy "Authenticated users can create painting assets"
on public.painting_assets
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "Admins can moderate painting assets" on public.painting_assets;
create policy "Admins can moderate painting assets"
on public.painting_assets
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete painting assets" on public.painting_assets;
create policy "Admins can delete painting assets"
on public.painting_assets
for delete
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Anyone can create painting reports" on public.painting_reports;
create policy "Anyone can create painting reports"
on public.painting_reports
for insert
to anon, authenticated
with check (true);

drop policy if exists "Users can read own reports" on public.painting_reports;
create policy "Users can read own reports"
on public.painting_reports
for select
to authenticated
using (reporter_user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Admins can update painting reports" on public.painting_reports;
create policy "Admins can update painting reports"
on public.painting_reports
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can read moderation logs" on public.moderation_logs;
create policy "Admins can read moderation logs"
on public.moderation_logs
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can read painting bans" on public.painting_bans;
create policy "Admins can read painting bans"
on public.painting_bans
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Admins can manage painting bans" on public.painting_bans;
create policy "Admins can manage painting bans"
on public.painting_bans
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'painting-room-assets',
  'painting-room-assets',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read painting room storage assets" on storage.objects;
create policy "Anyone can read painting room storage assets"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'painting-room-assets');

drop policy if exists "Authenticated users can upload painting room storage assets" on storage.objects;
create policy "Authenticated users can upload painting room storage assets"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'painting-room-assets' and owner = auth.uid());

drop policy if exists "Owners can update painting room storage assets" on storage.objects;
create policy "Owners can update painting room storage assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'painting-room-assets' and (owner = auth.uid() or public.is_admin(auth.uid())))
with check (bucket_id = 'painting-room-assets' and (owner = auth.uid() or public.is_admin(auth.uid())));

drop policy if exists "Owners or admins can delete painting room storage assets" on storage.objects;
create policy "Owners or admins can delete painting room storage assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'painting-room-assets' and (owner = auth.uid() or public.is_admin(auth.uid())));
