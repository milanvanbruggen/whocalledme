alter table public.phone_profiles
  add column if not exists reports_confirmed integer not null default 0,
  add column if not exists reports_disputed integer not null default 0;

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
