alter table public.call_attempts
  add column if not exists payload jsonb,
  add column if not exists transcript text,
  add column if not exists summary text,
  add column if not exists confidence numeric(3,2),
  add column if not exists ended_at timestamptz;
