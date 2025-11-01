-- Add source tracking fields to phone_profiles
-- This tracks whether name and entity type came from ElevenLabs structured output or fallback heuristics

do $$
begin
  if not exists (select 1 from pg_type where typname = 'data_source') then
    create type public.data_source as enum ('elevenlabs', 'fallback');
  end if;
end $$;

alter table public.phone_profiles
  add column if not exists name_source public.data_source,
  add column if not exists entity_type_source public.data_source,
  add column if not exists elevenlabs_raw_response jsonb;

-- Add comment for documentation
comment on column public.phone_profiles.name_source is 'Indicates whether caller_name was derived from ElevenLabs structured output or fallback heuristics';
comment on column public.phone_profiles.entity_type_source is 'Indicates whether entity type (particulier/bedrijf) was derived from ElevenLabs structured output or fallback heuristics';
comment on column public.phone_profiles.elevenlabs_raw_response is 'Raw JSON response from ElevenLabs webhook for debugging and analysis';

