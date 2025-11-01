import type { NumberProfile } from "@/lib/mock-profiles";

export type LookupStatus = "cached" | "calling" | "not_found" | "failed" | "pending";
export type ProfileCallOutcome = "confirmed" | "voicemail" | "pending";
export type DataSource = "elevenlabs" | "fallback";

export interface PhoneProfileRecord {
  id: string;
  normalized: string;
  caller_name: string;
  aka: string[] | null;
  summary: string | null;
  transcript_preview: string | null;
  last_checked: string | null;
  confidence: number | null;
  call_outcome: ProfileCallOutcome;
  tags: string[] | null;
  reports_confirmed: number | null;
  reports_disputed: number | null;
  name_source: DataSource | null;
  entity_type_source: DataSource | null;
  elevenlabs_raw_response: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface PhoneLookupRecord {
  id: string;
  normalized: string;
  raw_input: string;
  status: LookupStatus;
  profile_id: string | null;
  created_at: string;
}

export interface CallAttemptRecord {
  id: string;
  lookup_id: string;
  status: string;
  elevenlabs_conversation_id: string | null;
  elevenlabs_status: string | null;
  error_message: string | null;
  transcript: string | null;
  summary: string | null;
  confidence: number | null;
  payload: Record<string, unknown> | null;
  requested_at: string;
  updated_at: string;
}

export function mapProfileRecord(record: PhoneProfileRecord): NumberProfile {
  return {
    normalized: record.normalized,
    callerName: record.caller_name,
    aka: record.aka ?? undefined,
    summary: record.summary ?? "",
    transcriptPreview: record.transcript_preview ?? "",
    lastChecked: record.last_checked ?? record.updated_at,
    confidence: record.confidence ?? 0,
    callOutcome: record.call_outcome,
    reports: {
      confirmedCount: record.reports_confirmed ?? 0,
      disputedCount: record.reports_disputed ?? 0
    },
    tags: record.tags ?? []
  };
}
