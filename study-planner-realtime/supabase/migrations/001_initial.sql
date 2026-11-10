create extension if not exists pgcrypto;

create table if not exists public.planner_events (
  page_id text primary key,
  source text not null check (source in ('calendar','tasks')),
  title text not null,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  notes text not null default '',
  tags text[] not null default '{}',
  category text not null default '',
  course text not null default '',
  weighting text not null default '',
  is_completed boolean not null default false,
  is_fixed boolean not null default false,
  reminder_minutes integer not null default 10 check (reminder_minutes between 0 and 1440),
  url text not null default '',
  last_edited_time timestamptz,
  is_deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists planner_events_start_at_idx on public.planner_events(start_at) where is_deleted=false;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_key text unique not null,
  event_page_id text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz not null default now()
);
create table if not exists public.app_secrets (
  secret_name text primary key,
  secret_value text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.planner_pin_attempts (
  ip_hash text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.planner_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.app_secrets enable row level security;
alter table public.planner_pin_attempts enable row level security;
-- Agenda memang ditampilkan sebagai kalender publik sesuai pilihan pemilik.
drop policy if exists "public can read planner events" on public.planner_events;
create policy "public can read planner events" on public.planner_events for select to anon, authenticated using (is_deleted=false);
grant select on public.planner_events to anon, authenticated;
grant all on public.planner_events to service_role;
grant all on public.push_subscriptions to service_role;
grant all on public.notification_deliveries to service_role;
grant all on public.app_secrets to service_role;
grant all on public.planner_pin_attempts to service_role;
-- Tidak ada policy publik untuk insert/update/delete atau tabel rahasia.

-- Aktifkan Realtime untuk cache planner_events.
do $$ begin
  alter publication supabase_realtime add table public.planner_events;
exception when duplicate_object then null;
when undefined_object then raise notice 'Publication supabase_realtime belum tersedia; aktifkan Realtime di dashboard Supabase.';
end $$;
