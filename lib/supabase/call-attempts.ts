import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CallAttemptRecord } from "@/lib/supabase/types";

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
  conversationId: string;
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
}: UpdateCallAttemptInput) {
  const supabase = getSupabaseAdminClient();

  const updates: Record<string, unknown> = {};

  if (status) updates.status = status;
  if (elevenLabsStatus !== undefined) updates.elevenlabs_status = elevenLabsStatus;
  if (errorMessage !== undefined) updates.error_message = errorMessage;
  if (payload !== undefined) updates.payload = payload;
  if (transcript !== undefined) updates.transcript = transcript;
  if (summary !== undefined) updates.summary = summary;
  if (confidence !== undefined) updates.confidence = confidence;
  if (endedAt !== undefined) updates.ended_at = endedAt
    ? new Date(endedAt).toISOString()
    : null;

  if (Object.keys(updates).length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("call_attempts")
    .update(updates)
    .eq("elevenlabs_conversation_id", conversationId)
    .select("lookup_id")
    .maybeSingle();

  if (error) {
    console.error("Failed to update call attempt", error);
    return null;
  }

  return (data as { lookup_id: string } | null)?.lookup_id ?? null;
}

export async function getLatestCallAttempt(lookupId: string) {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("call_attempts")
    .select("*")
    .eq("lookup_id", lookupId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch call attempt", error);
    return null;
  }

  return data as CallAttemptRecord | null;
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
