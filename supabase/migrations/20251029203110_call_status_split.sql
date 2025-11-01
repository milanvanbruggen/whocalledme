alter type public.call_status rename to lookup_status;

create type public.profile_call_outcome as enum ('confirmed', 'voicemail', 'pending');

alter table public.phone_profiles
  alter column call_status drop default;

alter table public.phone_profiles
  alter column call_status type text using call_status::text;

alter table public.phone_profiles
  alter column call_status type public.profile_call_outcome using (
    case call_status
      when 'cached' then 'confirmed'
      when 'calling' then 'pending'
      when 'not_found' then 'pending'
      when 'failed' then 'pending'
      when 'pending' then 'pending'
      else 'pending'
    end
  )::public.profile_call_outcome;

alter table public.phone_profiles
  alter column call_status set default 'pending';

alter table public.phone_profiles
  alter column call_status set not null;

alter table public.phone_profiles
  rename column call_status to call_outcome;

alter table public.phone_lookups
  alter column status type public.lookup_status using status::text::public.lookup_status;
