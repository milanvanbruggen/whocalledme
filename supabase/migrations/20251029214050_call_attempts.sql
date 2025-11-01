create table public.call_attempts (
    id uuid primary key default gen_random_uuid(),
    lookup_id uuid not null references public.phone_lookups(id) on delete cascade,
    status text not null,
    elevenlabs_conversation_id text,
    elevenlabs_status text,
    error_message text,
    requested_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create index call_attempts_lookup_id_idx on public.call_attempts (lookup_id);

alter table public.call_attempts enable row level security;

create policy "Allow service role call attempts"
  on public.call_attempts
  for all
  using (auth.role() = 'service_role');

create trigger set_call_attempts_updated_at
before update on public.call_attempts
for each row
execute procedure public.set_updated_at();
