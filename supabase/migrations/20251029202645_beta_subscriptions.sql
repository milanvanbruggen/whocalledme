-- Create table for beta waitlist subscriptions
create table if not exists public.beta_subscriptions (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    reference text not null unique,
    created_at timestamptz not null default timezone('utc', now())
);

-- Ensure case-insensitive email uniqueness by lowering automatically
create unique index if not exists beta_subscriptions_email_lower_idx on public.beta_subscriptions (lower(email));

-- Enable RLS and restrict writes to service role by default
alter table public.beta_subscriptions enable row level security;

create policy "Allow service role"
  on public.beta_subscriptions
  for all
  using (auth.role() = 'service_role');
