-- Dedicated Câmara project only. Do not apply in unrelated projects.
-- Public read of a *sanitized* snapshot; only service_role may write.
create table if not exists public.camara_social_snapshots (
  id text primary key check (id = 'camara'),
  collected_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.camara_social_snapshots enable row level security;
revoke all on public.camara_social_snapshots from public, anon, authenticated;
grant select on public.camara_social_snapshots to anon;
grant select, insert, update, delete on public.camara_social_snapshots to service_role;
drop policy if exists camara_social_public_read on public.camara_social_snapshots;
create policy camara_social_public_read
  on public.camara_social_snapshots
  for select to anon
  using (id = 'camara');

-- Private history for 24 h deltas and longer-term analysis. Never public via REST.
create table if not exists public.camara_social_follower_history (
  network text not null check (network in ('instagram','x','youtube','tiktok','facebook')),
  collected_at timestamptz not null,
  followers bigint not null check (followers >= 0),
  primary key (network, collected_at)
);
create index if not exists camara_social_history_recent
  on public.camara_social_follower_history (network, collected_at desc);
alter table public.camara_social_follower_history enable row level security;
revoke all on public.camara_social_follower_history from public, anon, authenticated;
grant select, insert, update, delete on public.camara_social_follower_history to service_role;
