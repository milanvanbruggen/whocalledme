create type public.call_status as enum ('cached', 'calling', 'not_found', 'failed', 'pending');

create table public.phone_profiles (
    id uuid primary key default gen_random_uuid(),
    normalized text not null unique,
    caller_name text not null,
    aka text[] not null default '{}',
    summary text,
    transcript_preview text,
    last_checked timestamptz,
    confidence numeric(3,2),
    call_status public.call_status not null default 'pending',
    tags text[] not null default '{}',
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create unique index phone_profiles_normalized_idx on public.phone_profiles (normalized);

create table public.phone_lookups (
    id uuid primary key default gen_random_uuid(),
    normalized text not null,
    raw_input text not null,
    status public.call_status not null default 'pending',
    profile_id uuid references public.phone_profiles(id) on delete set null,
    created_at timestamptz not null default timezone('utc', now())
);

create index phone_lookups_normalized_idx on public.phone_lookups (normalized);
create index phone_lookups_created_at_idx on public.phone_lookups (created_at desc);

alter table public.phone_profiles enable row level security;
alter table public.phone_lookups enable row level security;

create policy "Allow service role profiles"
  on public.phone_profiles
  for all
  using (auth.role() = 'service_role');

create policy "Allow service role lookups"
  on public.phone_lookups
  for all
  using (auth.role() = 'service_role');
