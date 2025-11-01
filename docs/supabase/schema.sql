-- Create table for beta waitlist subscriptions
create table if not exists public.beta_subscriptions (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    reference text not null unique,
    created_at timestamptz not null default timezone('utc', now())
);

-- Ensure case-insensitive email uniqueness by lowering automatically
create unique index if not exists beta_subscriptions_email_lower_idx on public.beta_subscriptions (lower(email));

-- RLS so only service role can write; other clients read-only
alter table public.beta_subscriptions enable row level security;

-- Allow service role full access (handled automatically), but optionally allow anon to select aggregated stats later
create policy "Allow service role" on public.beta_subscriptions for all using (auth.role() = 'service_role');

-- Optional: allow public read-only access (commented out)
-- create policy "Public read waitlist" on public.beta_subscriptions
--     for select using (true);

-- Lookup and profile data ----------------------------------------------

create type if not exists public.lookup_status as enum ('cached', 'calling', 'not_found', 'failed', 'pending');
create type if not exists public.profile_call_outcome as enum ('confirmed', 'voicemail', 'pending');

create table if not exists public.phone_profiles (
    id uuid primary key default gen_random_uuid(),
    normalized text not null unique,
    caller_name text not null,
    aka text[] not null default '{}',
    summary text,
    transcript_preview text,
    last_checked timestamptz,
    confidence numeric(3,2),
    call_outcome public.profile_call_outcome not null default 'pending',
    tags text[] not null default '{}',
    reports_confirmed integer not null default 0,
    reports_disputed integer not null default 0,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.phone_lookups (
    id uuid primary key default gen_random_uuid(),
    normalized text not null,
    raw_input text not null,
    status public.lookup_status not null default 'pending',
    profile_id uuid references public.phone_profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists phone_profiles_normalized_idx on public.phone_profiles (normalized);
create index if not exists phone_lookups_normalized_idx on public.phone_lookups (normalized);
create index if not exists phone_lookups_created_at_idx on public.phone_lookups (created_at desc);

alter table public.phone_profiles enable row level security;
alter table public.phone_lookups enable row level security;

create policy if not exists "Allow service role profiles"
  on public.phone_profiles
  for all
  using (auth.role() = 'service_role');

create policy if not exists "Allow service role lookups"
  on public.phone_lookups
  for all
  using (auth.role() = 'service_role');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_phone_profiles_updated_at on public.phone_profiles;

create trigger set_phone_profiles_updated_at
before update on public.phone_profiles
for each row
execute procedure public.set_updated_at();

create table if not exists public.call_attempts (
    id uuid primary key default gen_random_uuid(),
    lookup_id uuid not null references public.phone_lookups(id) on delete cascade,
    status text not null,
    elevenlabs_conversation_id text,
    elevenlabs_status text,
    error_message text,
    requested_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists call_attempts_lookup_id_idx on public.call_attempts (lookup_id);

alter table public.call_attempts enable row level security;

create policy if not exists "Allow service role call attempts"
  on public.call_attempts
  for all
  using (auth.role() = 'service_role');

create trigger set_call_attempts_updated_at
before update on public.call_attempts
for each row
execute procedure public.set_updated_at();

alter table if exists public.call_attempts
  add column if not exists payload jsonb,
  add column if not exists transcript text,
  add column if not exists summary text,
  add column if not exists confidence numeric(3,2),
  add column if not exists ended_at timestamptz;
