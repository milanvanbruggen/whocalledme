export type LookupStatusValue = "cached" | "calling" | "not_found" | "failed" | "pending";

export interface CallAttemptSnapshot {
  status?: string | null;
  elevenlabs_status?: string | null;
  error_message?: string | null;
  summary?: string | null;
  transcript?: string | null;
  confidence?: number | null;
  updated_at?: string;
  payload?: Record<string, unknown> | null;
}

