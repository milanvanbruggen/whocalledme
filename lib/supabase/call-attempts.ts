import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CallAttemptRecord } from "@/lib/supabase/types";
import { invalidateCache } from "@/lib/cache/status-cache";

export interface RecordCallAttemptInput {
  lookupId: string;
  status: string;
  conversationId?: string | null;
  elevenLabsStatus?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function recordCallAttempt({
  lookupId,
  status,
  conversationId,
  elevenLabsStatus,
  errorMessage,
  payload
}: RecordCallAttemptInput) {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase.from("call_attempts").insert({
    lookup_id: lookupId,
    status,
    elevenlabs_conversation_id: conversationId ?? null,
    elevenlabs_status: elevenLabsStatus ?? null,
    error_message: errorMessage ?? null,
    payload: payload ?? null
  });

  if (error) {
    console.error("Failed to record call attempt", error);
  }
}

interface UpdateCallAttemptInput {
  conversationId?: string;
  status?: string;
  elevenLabsStatus?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown> | null;
  transcript?: string | null;
  summary?: string | null;
  confidence?: number | null;
  endedAt?: string | Date | null;
}

export async function updateCallAttemptByConversation({
  conversationId,
  status,
  elevenLabsStatus,
  errorMessage,
  payload,
  transcript,
  summary,
  confidence,
  endedAt
}: UpdateCallAttemptInput & { conversationId: string }) {
  const supabase = getSupabaseAdminClient();
  const IS_DEV = process.env.NODE_ENV !== "production";

  const updates: Record<string, unknown> = {};

  // Use !== undefined to allow empty strings and null values
  if (status !== undefined) updates.status = status;
  if (elevenLabsStatus !== undefined) updates.elevenlabs_status = elevenLabsStatus;
  if (errorMessage !== undefined) updates.error_message = errorMessage;
  if (payload !== undefined) updates.payload = payload;
  if (transcript !== undefined) updates.transcript = transcript;
  if (summary !== undefined) updates.summary = summary;
  if (confidence !== undefined) updates.confidence = confidence;
  if (endedAt !== undefined) updates.ended_at = endedAt
    ? new Date(endedAt).toISOString()
    : null;

  // Note: updated_at is automatically updated by database trigger, so we don't need to set it manually
  // But we need at least one field to update, otherwise the update won't trigger the updated_at update
  
  if (Object.keys(updates).length === 0) {
    // If no updates provided, at least update a dummy field to trigger updated_at
    // But this shouldn't happen in practice
    if (IS_DEV) {
      console.warn("⚠️ No updates provided for call attempt update");
    }
    return null;
  }

  const { data, error } = await supabase
    .from("call_attempts")
    .update(updates)
    .eq("elevenlabs_conversation_id", conversationId)
    .select("lookup_id")
    .maybeSingle();

  if (error) {
    console.error("❌ Failed to update call attempt by conversation:", {
      error: error.message,
      code: error.code,
      details: error.details,
      conversationId,
      updates
    });
    return null;
  }

  const lookupId = (data as { lookup_id: string } | null)?.lookup_id ?? null;
  
  // Invalidate cache after successful update
  if (lookupId) {
    invalidateCache(lookupId);
  }

  return lookupId;
}

export async function getLatestCallAttempt(lookupId: string) {
  const supabase = getSupabaseAdminClient();
  const IS_DEV = process.env.NODE_ENV !== "production";

  // Force fresh query by ordering by updated_at DESC and using maybeSingle()
  // This ensures we get the most recently updated record
  // First get all records to check if there are multiple
  const { data: allData, error: allError } = await supabase
    .from("call_attempts")
    .select("*")
    .eq("lookup_id", lookupId)
    .order("updated_at", { ascending: false })
    .limit(5); // Get up to 5 records to check for duplicates

  if (allError) {
    console.error("Failed to fetch call attempts", allError);
    return null;
  }

  // Always log multiple attempts in production for debugging
  if (allData && allData.length > 1) {
    console.log("⚠️ Multiple call attempts found", {
      lookupId,
      count: allData.length,
      records: allData.map((r: CallAttemptRecord) => ({
        id: r.id,
        status: r.status,
        elevenlabs_status: r.elevenlabs_status,
        updated_at: r.updated_at
      }))
    });
  }

  // Get the most recent one using maybeSingle() with ordering
  // Force fresh query by adding a small delay if needed (handled by caller)
  const { data, error } = await supabase
    .from("call_attempts")
    .select("*")
    .eq("lookup_id", lookupId)
    .order("updated_at", { ascending: false }) // Order by updated_at to get most recent
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch call attempt", error);
    return null;
  }

  const result = data as CallAttemptRecord | null;
  
  // Always log in production for debugging
  console.log("🔍 getLatestCallAttempt", {
    lookupId,
    found: !!result,
    status: result?.status,
    elevenlabs_status: result?.elevenlabs_status,
    hasSummary: !!result?.summary,
    hasTranscript: !!result?.transcript,
    updated_at: result?.updated_at,
    totalRecords: allData?.length ?? 0,
    allRecordsUpdatedAt: allData?.map((r: CallAttemptRecord) => r.updated_at) ?? []
  });

  // Return first result or null
  return result;
}

export async function getCallAttemptByConversationId(conversationId: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("call_attempts")
    .select("*")
    .eq("elevenlabs_conversation_id", conversationId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch call attempt by conversation id", error);
    return null;
  }

  return data as CallAttemptRecord | null;
}

export async function updateCallAttemptByLookupId({
  lookupId,
  status,
  elevenLabsStatus,
  errorMessage,
  payload,
  transcript,
  summary,
  confidence,
  endedAt
}: UpdateCallAttemptInput & { lookupId: string }) {
  const supabase = getSupabaseAdminClient();
  const IS_DEV = process.env.NODE_ENV !== "production";

  const updates: Record<string, unknown> = {};

  // Use !== undefined to allow empty strings and null values
  if (status !== undefined) updates.status = status;
  if (elevenLabsStatus !== undefined) updates.elevenlabs_status = elevenLabsStatus;
  if (errorMessage !== undefined) updates.error_message = errorMessage;
  if (payload !== undefined) updates.payload = payload;
  if (transcript !== undefined) updates.transcript = transcript;
  if (summary !== undefined) updates.summary = summary;
  if (confidence !== undefined) updates.confidence = confidence;
  if (endedAt !== undefined) updates.ended_at = endedAt
    ? new Date(endedAt).toISOString()
    : null;

  // Note: updated_at is automatically updated by database trigger, so we don't need to set it manually
  // But we need at least one field to update, otherwise the update won't trigger the updated_at update
  
  if (Object.keys(updates).length === 0) {
    // If no updates provided, at least update a dummy field to trigger updated_at
    // But this shouldn't happen in practice
    if (IS_DEV) {
      console.warn("⚠️ No updates provided for call attempt update");
    }
    return null;
  }

  // First get the latest call attempt for this lookupId
  const latestAttempt = await getLatestCallAttempt(lookupId);
  
  if (!latestAttempt) {
    console.error("❌ No call attempt found for lookupId:", lookupId);
    return null;
  }
  
  if (IS_DEV) {
    console.log("🔧 Updating call attempt by lookupId:", {
      lookupId,
      attemptId: latestAttempt.id,
      currentStatus: latestAttempt.status,
      currentElevenLabsStatus: latestAttempt.elevenlabs_status,
      updates
    });
  }
  
  const { data, error } = await supabase
    .from("call_attempts")
    .update(updates)
    .eq("id", latestAttempt.id)
    .select("*")
    .maybeSingle();

  if (error) {
    console.error("❌ Failed to update call attempt by lookup ID:", {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      lookupId,
      attemptId: latestAttempt.id,
      updates
    });
    return null;
  }

  if (!data) {
    console.error("❌ Update returned no data - row might not exist:", {
      lookupId,
      attemptId: latestAttempt.id
    });
    return null;
  }

  if (IS_DEV && data) {
    console.log("✅ Call attempt updated:", {
      id: data.id,
      status: (data as CallAttemptRecord).status,
      elevenlabs_status: (data as CallAttemptRecord).elevenlabs_status,
      payload: (data as CallAttemptRecord).payload
    });
  }

  // Invalidate cache after successful update
  invalidateCache(lookupId);

  return data as CallAttemptRecord | null;
}
