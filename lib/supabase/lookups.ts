import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  type LookupStatus,
  type PhoneProfileRecord,
  type ProfileCallOutcome,
  type DataSource,
  mapProfileRecord
} from "@/lib/supabase/types";
import { invalidateCache } from "@/lib/cache/status-cache";

export async function fetchProfileRecordByNumber(normalized: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("phone_profiles")
    .select("*")
    .eq("normalized", normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch phone profile", error);
    return null;
  }

  if (!data) {
    return null;
  }

  return data as PhoneProfileRecord;
}

export async function getProfileById(profileId: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("phone_profiles")
    .select("*")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch profile by id", error);
    return null;
  }

  return data as PhoneProfileRecord | null;
}

export async function fetchProfileByNumber(normalized: string) {
  const record = await fetchProfileRecordByNumber(normalized);
  if (!record) {
    return null;
  }
  return mapProfileRecord(record);
}

export async function listRecentProfiles(limit = 3) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("phone_profiles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to list recent profiles", error);
    return [];
  }

  if (!data) {
    return [];
  }

  return (data as PhoneProfileRecord[]).map(mapProfileRecord);
}

export async function fetchProfileWithRecord(normalized: string) {
  const record = await fetchProfileRecordByNumber(normalized);
  if (!record) {
    return null;
  }
  return {
    record,
    profile: mapProfileRecord(record)
  };
}

export async function recordLookup(params: {
  normalized: string;
  rawInput: string;
  status: LookupStatus;
  profileId?: string | null;
}) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("phone_lookups")
    .insert({
      normalized: params.normalized,
      raw_input: params.rawInput,
      status: params.status,
      profile_id: params.profileId ?? null
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to record lookup", error);
    throw new Error(
      `Supabase recordLookup failed: ${error.message ?? "unknown error"} [code=${error.code ?? "n/a"}]`
    );
  }

  return (data as { id: string } | null)?.id ?? null;
}

export async function updateLookupStatus(
  lookupId: string,
  status: LookupStatus,
  profileId?: string | null
) {
  const supabase = getSupabaseAdminClient();
  const IS_DEV = process.env.NODE_ENV !== "production";

  const updates: Record<string, unknown> = {
    status
  };

  if (profileId !== undefined) {
    updates.profile_id = profileId;
  }

  const { error } = await supabase
    .from("phone_lookups")
    .update(updates)
    .eq("id", lookupId);

  if (error) {
    console.error("Failed to update lookup status", error);
  } else {
    // Invalidate cache after successful update
    invalidateCache(lookupId);
    
    if (IS_DEV) {
      console.log("✅ Lookup status updated", {
        lookupId,
        status,
        profileId: profileId ?? null
      });
    }
  }
}

export async function getLookupById(lookupId: string) {
  const supabase = getSupabaseAdminClient();
  const IS_DEV = process.env.NODE_ENV !== "production";

  const { data, error } = await supabase
    .from("phone_lookups")
    .select("id, normalized, profile_id, status")
    .eq("id", lookupId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch lookup", error);
    return null;
  }

  if (IS_DEV && data) {
    console.log("🔍 getLookupById", {
      lookupId,
      status: data.status,
      profileId: data.profile_id
    });
  }

  return data as { id: string; normalized: string; profile_id: string | null; status: string | null } | null;
}

export async function getLatestLookupByNormalized(normalized: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("phone_lookups")
    .select("id, normalized, profile_id, status, created_at")
    .eq("normalized", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch latest lookup by normalized", error);
    return null;
  }

  return data as { id: string; normalized: string; profile_id: string | null; status: string; created_at: string } | null;
}

export interface UpsertProfileInput {
  normalized: string;
  callerName: string;
  summary?: string | null;
  transcriptPreview?: string | null;
  lastChecked?: string | Date | null;
  confidence?: number | null;
  callOutcome?: ProfileCallOutcome;
  tags?: string[] | null;
  aka?: string[] | null;
  reportsConfirmed?: number | null;
  reportsDisputed?: number | null;
  nameSource?: DataSource | null;
  entityTypeSource?: DataSource | null;
  elevenlabsRawResponse?: Record<string, unknown> | null;
}

export async function upsertPhoneProfile(input: UpsertProfileInput) {
  const supabase = getSupabaseAdminClient();

  const upsertData: Record<string, unknown> = {
    normalized: input.normalized,
    caller_name: input.callerName,
    summary: input.summary ?? null,
    transcript_preview: input.transcriptPreview ?? null,
    last_checked: input.lastChecked ? new Date(input.lastChecked).toISOString() : new Date().toISOString(),
    confidence: input.confidence ?? null,
    call_outcome: input.callOutcome ?? "pending",
    tags: input.tags ?? [],
    aka: input.aka ?? [],
    reports_confirmed: input.reportsConfirmed ?? 0,
    reports_disputed: input.reportsDisputed ?? 0
  };

  // Only include new fields if they are provided (to handle cases where migration hasn't run yet)
  if (input.nameSource !== undefined) {
    upsertData.name_source = input.nameSource;
  }
  if (input.entityTypeSource !== undefined) {
    upsertData.entity_type_source = input.entityTypeSource;
  }
  if (input.elevenlabsRawResponse !== undefined) {
    upsertData.elevenlabs_raw_response = input.elevenlabsRawResponse;
  }

  const { data, error } = await supabase
    .from("phone_profiles")
    .upsert(upsertData, { onConflict: "normalized", ignoreDuplicates: false })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Failed to upsert phone profile", {
      error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      upsertDataKeys: Object.keys(upsertData)
    });
    return null;
  }

  return (data as { id: string } | null)?.id ?? null;
}
