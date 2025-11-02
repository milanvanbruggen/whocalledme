"use client";

import * as React from "react";

import { lookupPhoneNumber, type LookupResult } from "@/app/actions/lookup";
import { CallProgress } from "@/components/call-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhoneInputField } from "@/components/ui/phone-input";
import { TestTube } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { CallAttemptSnapshot, LookupStatusValue } from "@/lib/lookup-status";
import { validatePhoneNumber } from "@/lib/phone";
import { validatePhoneNumberClient } from "@/lib/phone-client";

function toPlainObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractNameFromPayload(payload?: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  
  const data = toPlainObject(payload.data);
  
  // First, try to extract from analysis.data_collection_results (ElevenLabs structure)
  const analysis = toPlainObject(data.analysis);
  if (analysis) {
    const dataCollectionResults = toPlainObject(analysis.data_collection_results);
    if (dataCollectionResults) {
      const nameItem = toPlainObject(dataCollectionResults.name);
      if (nameItem && typeof nameItem.value === "string" && nameItem.value.trim().length > 0) {
        const name = nameItem.value.trim();
        if (name.length > 1) return name;
      }
    }
  }
  
  // Second, try to extract from transcript (user messages)
  const transcript = Array.isArray(data.transcript) ? data.transcript : [];
  for (const entryRaw of transcript) {
    const entry = toPlainObject(entryRaw);
    if (entry.role !== "user" || typeof entry.message !== "string") continue;
    const cleaned = entry.message.replace(/[.!?]+$/, "").trim();
    const match = cleaned.match(
      /\b(?:met|u spreekt met|dit is|je spreekt met|hier is|mijn naam is|ik ben)\s+([A-Z][\p{L}'`\- ]+)/iu
    );
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 1) return name;
    }
  }
  
  // Third, try to extract from metadata or other fields
  const metadata = toPlainObject(data.metadata);
  if (metadata) {
    const nameFields = ["callerName", "caller_name", "name", "personName", "person_name"];
    for (const field of nameFields) {
      const nameValue = metadata[field];
      if (typeof nameValue === "string" && nameValue.trim().length > 0) {
        const name = nameValue.trim();
        if (name.length > 1 && name.toLowerCase() !== "onbekende beller") {
          return name;
        }
      }
    }
  }
  
  return null;
}

const BUSINESS_KEYWORDS = [
  "bedrijf",
  "b.v",
  "bv",
  "holding",
  "studio",
  "agency",
  "bureau",
  "shop",
  "winkel",
  "restaurant",
  "clinic",
  "solutions",
  "consultancy",
  "services",
  "bv.",
  "llc",
  "inc",
  "gmbh",
  "groep",
  "group",
  "co.",
  "company"
];

function deriveEntityTag(summary?: string | null, callerName?: string | null): string | null {
  const text = `${summary ?? ""} ${callerName ?? ""}`.toLowerCase();
  if (BUSINESS_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "bedrijf";
  }
  if (callerName) {
    return "persoon";
  }
  return null;
}

type ProfileSnapshot = {
  callerName?: string | null;
  normalized?: string | null;
  summary?: string | null;
  transcriptPreview?: string | null;
  confidence?: number | null;
  lastChecked?: string | null;
  tags?: string[] | null;
};

type ApiCallAttempt = {
  status?: string | null;
  elevenlabs_status?: string | null;
  error_message?: string | null;
  summary?: string | null;
  transcript?: string | null;
  confidence?: number | null;
  updated_at?: string | null;
  payload?: Record<string, unknown> | null;
};

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `"${key}":${stableStringify((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

/**
 * Compute hash of relevant fields for change detection
 */
function computeDataHash(snapshot: CallAttemptSnapshot | null): string {
  if (!snapshot) return "null";
  
  const relevantFields = {
    status: snapshot.status ?? null,
    elevenlabs_status: snapshot.elevenlabs_status ?? null,
    error_message: snapshot.error_message ?? null,
    summary: snapshot.summary ?? null,
    transcript: snapshot.transcript ?? null,
    confidence: snapshot.confidence ?? null,
    updated_at: snapshot.updated_at ?? null,
    payload: snapshot.payload ?? null
  };
  
  return stableStringify(relevantFields);
}

/**
 * Check if two snapshots are equal based on hash comparison
 */
function areSnapshotsEqual(a: CallAttemptSnapshot | null, b: CallAttemptSnapshot | null): boolean {
  return computeDataHash(a) === computeDataHash(b);
}

function buildCallAttemptSnapshot(
  apiAttempt: ApiCallAttempt | null,
  profile: ProfileSnapshot | null,
  lookupStatus: LookupStatusValue | undefined
): CallAttemptSnapshot | null {
  if (!apiAttempt && lookupStatus !== "cached" && !profile) {
    return null;
  }

  const shouldForcePostCall = lookupStatus === "cached";

  const payloadBase: Record<string, unknown> =
    apiAttempt && apiAttempt.payload && typeof apiAttempt.payload === "object"
      ? { ...apiAttempt.payload }
      : {};

  if (shouldForcePostCall) {
    if (!("event" in payloadBase)) {
      payloadBase.event = "post_call_transcription";
    }
    if (!("type" in payloadBase)) {
      payloadBase.type = "post_call_transcription";
    }
  }

  const statusValue = apiAttempt?.status ?? (shouldForcePostCall ? "post_call_transcription" : null);
  const elevenStatusValue =
    apiAttempt?.elevenlabs_status ?? (shouldForcePostCall ? "post_call_transcription" : null);
  const summaryValue =
    apiAttempt?.summary ?? profile?.summary ?? profile?.transcriptPreview ?? apiAttempt?.transcript ?? null;
  const transcriptValue = apiAttempt?.transcript ?? profile?.transcriptPreview ?? null;
  const confidenceValue =
    apiAttempt?.confidence ?? (typeof profile?.confidence === "number" ? profile?.confidence : null);
  const updatedAtValue =
    apiAttempt?.updated_at ?? profile?.lastChecked ?? new Date().toISOString();

  const finalPayload = Object.keys(payloadBase).length > 0 ? payloadBase : apiAttempt?.payload ?? null;

  return {
    status: statusValue,
    elevenlabs_status: elevenStatusValue,
    error_message: apiAttempt?.error_message ?? null,
    summary: summaryValue,
    transcript: transcriptValue,
    confidence: confidenceValue ?? null,
    updated_at: updatedAtValue,
    payload: finalPayload
  };
}

type FormStatus = "idle" | "validating" | "submitting" | "success" | "error";

const isDev = process.env.NODE_ENV !== "production";
// DEV_DEBUG=true means show dev-only UI elements (same as old DISABLE_ELEVENLABS_CALLS=false behavior)
// DEV_DEBUG=false or unset means hide dev-only UI elements
const DEV_DEBUG = process.env.NEXT_PUBLIC_DEV_DEBUG === "true";
const showDevTools = isDev && DEV_DEBUG;

export function LookupForm() {
  const [value, setValue] = React.useState("");
  const [status, setStatus] = React.useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<LookupResult | null>(null);
  const [lookupStatus, setLookupStatus] = React.useState<LookupStatusValue | null>(null);
  const [callAttempt, setCallAttempt] = React.useState<CallAttemptSnapshot | null>(null);
  const [resultTags, setResultTags] = React.useState<string[]>([]);
  const [isResetting, setIsResetting] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  // Real-time validation feedback met client-side validatie
  React.useEffect(() => {
    if (value.trim().length === 0) {
      setErrorMessage(null);
      setStatus("idle");
      return;
    }

    // Gebruik client-side validatie voor betere feedback
    const clientValidation = validatePhoneNumberClient(value);
    if (!clientValidation.success) {
      setErrorMessage(clientValidation.message);
      setStatus("error");
    } else {
      setErrorMessage(null);
      setStatus("idle");
    }
  }, [value]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setResult(null);
    setLookupStatus(null);
    setCallAttempt(null);
    setResultTags([]);
    setStatus("validating");

    const validation = validatePhoneNumber(value);
    if (!validation.success) {
      setStatus("error");
      setErrorMessage(validation.message);
      return;
    }

    startTransition(() => {
      setStatus("submitting");
      lookupPhoneNumber({ phoneNumber: validation.phoneNumber })
        .then((res) => {
          setResult(res);
          setStatus("success");
          if (res.state === "cached") {
            setLookupStatus("cached");
          } else if (res.state === "calling") {
            setLookupStatus("calling");
          } else {
            setLookupStatus("not_found");
          }
        })
        .catch(() => {
          setStatus("error");
          setErrorMessage(
            "Er ging iets mis bij het starten van de call. Probeer het zo nog eens."
          );
        });
    });
  };

  React.useEffect(() => {
    const lookupId = result?.lookupId;

    if (!lookupId) {
      return;
    }

    let stopped = false;
    let intervalId: number | null = null;
    let fetchStatusRef: (() => Promise<void>) | null = null;
    let lastETag: string | null = null;
    let lastSnapshotHash: string | null = null;

    const fetchStatus = async () => {
      try {
        const headers: HeadersInit = {
          "Cache-Control": "no-cache"
        };
        
        // Add If-None-Match header if we have a previous ETag
        if (lastETag) {
          headers["If-None-Match"] = lastETag;
        }

        const response = await fetch(`/api/lookups/${lookupId}/status?ts=${Date.now()}`, {
          cache: "no-store",
          headers
        });

        // Handle 304 Not Modified response
        if (response.status === 304) {
          // No changes, skip processing
          return;
        }

        if (!response.ok) {
          return;
        }

        // Store ETag for next request
        const etag = response.headers.get("ETag");
        if (etag) {
          lastETag = etag;
        }

        const data = await response.json();
        if (stopped) return;

        const profile = data.profile ?? null;

        // Debug logging for profile data
        if (isDev && profile) {
          console.log("📋 Profile data received", {
            callerName: profile.callerName,
            normalized: profile.normalized,
            hasSummary: !!profile.summary,
            hasTranscriptPreview: !!profile.transcriptPreview,
            confidence: profile.confidence,
            tags: profile.tags
          });
        }

        const latestStatus = data.lookup?.status as LookupStatusValue | undefined;
        
        if (latestStatus) {
          setLookupStatus((prev) => (prev !== latestStatus ? latestStatus : prev));
        }

        const nextCallAttempt = buildCallAttemptSnapshot(
          (data.callAttempt ?? null) as ApiCallAttempt | null,
          profile,
          latestStatus
        );

        // Compute hash for change detection
        const nextHash = computeDataHash(nextCallAttempt);
        const hasChanged = nextHash !== lastSnapshotHash;

        // Debug logging in development
        if (isDev) {
          console.log("📊 Poll check", {
            lookupId,
            hashChanged: hasChanged,
            previousHash: lastSnapshotHash?.substring(0, 50) ?? "null",
            nextHash: nextHash.substring(0, 50),
            nextCallAttempt: {
              status: nextCallAttempt?.status,
              elevenlabs_status: nextCallAttempt?.elevenlabs_status,
              hasSummary: !!nextCallAttempt?.summary,
              hasTranscript: !!nextCallAttempt?.transcript,
              updated_at: nextCallAttempt?.updated_at
            },
            hasProfile: !!profile,
            latestStatus,
            rawApiData: {
              status: data.callAttempt?.status,
              elevenlabs_status: data.callAttempt?.elevenlabs_status,
              hasSummary: !!data.callAttempt?.summary,
              hasTranscript: !!data.callAttempt?.transcript
            }
          });
        }

        // Update hash tracker for next comparison
        lastSnapshotHash = nextHash;

        // Always update callAttempt state to ensure UI reflects latest data
        setCallAttempt((prev) => {
          // Double-check with areSnapshotsEqual for extra safety
          if (areSnapshotsEqual(prev, nextCallAttempt)) {
            return prev;
          }

          // Log only when there's an actual change
          if (hasChanged && isDev) {
            console.log("✅ Call attempt updated", {
              status: nextCallAttempt?.status ?? null,
              elevenlabs_status: nextCallAttempt?.elevenlabs_status ?? null,
              hasSummary: !!nextCallAttempt?.summary,
              hasTranscript: !!nextCallAttempt?.transcript
            });
          }

          return nextCallAttempt;
        });

        // Check if we have enough data to show a cached result
        const hasProfileData =
          profile &&
          (profile.callerName || profile.summary || profile.transcriptPreview);
        const hasCallAttemptData =
          nextCallAttempt &&
          (nextCallAttempt.summary || nextCallAttempt.transcript);
        
        // Normalize status values to handle edge cases like "b'Success'"
        const normalizeStatusForCheck = (value?: string | null) => {
          if (!value) return "";
          const str = String(value).replace(/^b['"]|['"]$/g, "").trim().toLowerCase();
          return str;
        };
        
        const elevenStatusNormalized = normalizeStatusForCheck(nextCallAttempt?.elevenlabs_status);
        const statusNormalized = normalizeStatusForCheck(nextCallAttempt?.status);
        
        // Check payload for event information (webhook stores event in payload)
        const payload = nextCallAttempt?.payload;
        const payloadEvent = payload && typeof payload === "object" && "event" in payload 
          ? normalizeStatusForCheck(String(payload.event))
          : "";
        const payloadType = payload && typeof payload === "object" && "type" in payload
          ? normalizeStatusForCheck(String(payload.type))
          : "";
        
        // Check for post-call events (webhook indicates completion)
        // Specifically check for post_call_transcription which is the main event we're looking for
        const hasPostCallEvent = 
          elevenStatusNormalized.includes("post_call_transcription") ||
          elevenStatusNormalized.includes("post-call-transcription") ||
          elevenStatusNormalized.includes("post_call") ||
          elevenStatusNormalized.includes("post-call") ||
          statusNormalized.includes("post_call_transcription") ||
          statusNormalized.includes("post-call-transcription") ||
          statusNormalized.includes("post_call") ||
          statusNormalized.includes("post-call") ||
          elevenStatusNormalized.includes("transcription") ||
          statusNormalized.includes("transcription") ||
          payloadEvent.includes("post_call_transcription") ||
          payloadEvent.includes("post-call-transcription") ||
          payloadEvent.includes("post_call") ||
          payloadEvent.includes("post-call") ||
          payloadEvent.includes("transcription") ||
          payloadType.includes("post_call_transcription") ||
          payloadType.includes("post-call-transcription") ||
          payloadType.includes("post_call") ||
          payloadType.includes("post-call") ||
          payloadType.includes("transcription");
        
        const hasCompletedStatus =
          latestStatus === "cached" ||
          (nextCallAttempt &&
            (elevenStatusNormalized.includes("success") ||
              elevenStatusNormalized.includes("completed") ||
              elevenStatusNormalized.includes("finished") ||
              elevenStatusNormalized.includes("succeeded") ||
              statusNormalized.includes("success") ||
              statusNormalized.includes("completed") ||
              statusNormalized.includes("finished") ||
              statusNormalized.includes("succeeded") ||
              hasPostCallEvent));

        // Show cached result if:
        // 1. Lookup status is cached (webhook already processed it)
        // 2. OR we have completed status AND (profile data OR call attempt data)
        // 3. OR we have post-call event AND call attempt data (webhook just processed it)
        const shouldShowCachedResult =
          latestStatus === "cached" ||
          (hasCompletedStatus && (hasProfileData || hasCallAttemptData)) ||
          (hasPostCallEvent && hasCallAttemptData);

        if (shouldShowCachedResult) {
          const attemptPayload = nextCallAttempt?.payload ?? null;
          const derivedName = extractNameFromPayload(attemptPayload);
          const summaryText =
            profile?.summary ??
            nextCallAttempt?.summary ??
            nextCallAttempt?.transcript ??
            "Samenvatting volgt zodra de agent klaar is.";
          const confidenceValue =
            profile?.confidence ?? nextCallAttempt?.confidence ?? null;
          const lastCheckedSource =
            profile?.lastChecked ?? nextCallAttempt?.updated_at ?? new Date().toISOString();

          setResult((prev) => {
            if (!prev) {
              return prev;
            }

            const prevLookupId = (prev as { lookupId?: string }).lookupId;
            if (prevLookupId && prevLookupId !== lookupId) {
              return prev;
            }

            const callerName =
              profile?.callerName ??
              derivedName ??
              (prev.state === "cached" ? prev.callerName : null) ?? // Preserve existing callerName if available
              "Onbekende beller";

            return {
              state: "cached",
              normalized:
                profile?.normalized ??
                data.lookup?.normalized ??
                data.lookup?.raw_input ??
                prev.normalized,
              callerName,
              lastChecked: formatDateTime(lastCheckedSource),
              summary: summaryText,
              confidence:
                confidenceValue ??
                (prev.state === "cached" ? prev.confidence : 0),
              lookupId,
              debugMessage: prev.debugMessage
            };
          });

          setResultTags((prev) => {
            const profileTags = Array.isArray(profile?.tags)
              ? profile.tags.filter(
                  (tag: unknown): tag is string => typeof tag === "string" && tag.trim().length > 0
                )
              : [];

            if (profileTags.length > 0) {
              return profileTags;
            }

            const caller = profile?.callerName ?? derivedName ?? null;
            const derivedTag = deriveEntityTag(summaryText, caller);

            if (derivedTag) {
              return prev.includes(derivedTag) ? prev : [...prev, derivedTag];
            }

            return prev;
          });

          // Update lookup status if it's still "calling" but we have completed data
          // This ensures the UI reflects the correct status even if the backend hasn't updated yet
          if (latestStatus !== "cached" && (hasCompletedStatus || hasPostCallEvent)) {
            setLookupStatus("cached");
          }

          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
        }

        if (latestStatus === "failed") {
          setResult((prev) => {
            if (!prev) {
              return prev;
            }

            const prevLookupId = (prev as { lookupId?: string }).lookupId;
            if (prevLookupId && prevLookupId !== lookupId) {
              return prev;
            }

            return {
              state: "not_found",
              normalized: data.lookup?.normalized ?? prev.normalized,
              message:
                nextCallAttempt?.error_message ??
                (prev.state === "not_found"
                  ? prev.message
                  : "De AI-call is mislukt. Probeer het later opnieuw."),
              lookupId
            };
          });

          if (intervalId) {
            window.clearInterval(intervalId);
            intervalId = null;
          }
        }
      } catch {
        // Ignore polling errors; next interval will retry.
      }
    };

    fetchStatusRef = fetchStatus;
    fetchStatus();
    // Shorter interval in development for faster testing
    intervalId = window.setInterval(fetchStatus, isDev ? 2000 : 5000);

    // Listen for manual refresh events (triggered after webhook simulation)
    const handleRefresh = () => {
      if (!stopped && fetchStatusRef) {
        if (isDev) {
          console.log("🔄 Manual refresh triggered via event");
        }
        fetchStatusRef();
      } else if (isDev) {
        console.log("⏸️ Refresh skipped (stopped or no fetchStatusRef)");
      }
    };
    window.addEventListener("refresh-status", handleRefresh);

    return () => {
      stopped = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
      window.removeEventListener("refresh-status", handleRefresh);
    };
  }, [result?.lookupId]);

  const helperText = React.useMemo(() => {
    if (status === "error" && errorMessage) {
      return errorMessage;
    }

    if (status === "submitting") {
      return "Onze AI-agent bereidt de call voor…";
    }

    if (status === "success" && result) {
      if (result.state === "cached") {
        return `Laatste check: ${result.lastChecked} · Vertrouwen ${Math.round(result.confidence * 100)}%`;
      }

      if (result.state === "calling") {
        if (callAttempt) {
          const statusText = callAttempt.elevenlabs_status ?? callAttempt.status;
          return `${result.message} (status: ${statusText})`;
        }
        return result.message;
      }

      return result.message;
    }

    return "Voer een telefoonnummer in om te starten.";
  }, [status, errorMessage, result, callAttempt]);

  return (
    <>
      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-3 sm:flex-row">
          <PhoneInputField
            autoFocus
            value={value}
            onChange={setValue}
            placeholder="+316 123 456 78"
            disabled={isPending}
            aria-invalid={status === "error"}
            aria-describedby="lookup-feedback"
            className="flex-1"
          />
          <Button
            className="shrink-0 sm:h-11 sm:px-7"
            disabled={isPending}
            type="submit"
          >
            {isPending ? "Bezig…" : "Zoek nummer"}
          </Button>
        </div>
        <p
          className="text-sm text-muted-foreground"
          id="lookup-feedback"
          aria-live="polite"
        >
          {helperText}
        </p>
        {status === "success" && result ? (
          <ResultCard
            result={result}
            callAttempt={callAttempt}
            lookupStatus={lookupStatus}
            tags={resultTags}
            setCallAttempt={setCallAttempt}
          />
        ) : null}
      </form>
      {showDevTools ? (
        <DevUtilities
          isResetting={isResetting}
          onReset={async () => {
            if (!window.confirm("Weet je zeker dat je alle lookup-data wilt verwijderen?")) {
              return;
            }

            setIsResetting(true);
            try {
              const response = await fetch("/api/test/reset-db", { method: "POST" });
              if (!response.ok) {
                const data = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(data?.error ?? "Onbekende fout");
              }

              setValue("");
              setStatus("idle");
              setErrorMessage(null);
              setResult(null);
              setLookupStatus(null);
              setCallAttempt(null);
              setResultTags([]);
              window.dispatchEvent(new Event("refresh-status"));
            } catch (error) {
              console.error("❌ Database reset mislukt:", error);
              alert(
                `Kon database niet leegmaken: ${error instanceof Error ? error.message : "Onbekende fout"}`
              );
            } finally {
              setIsResetting(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function ResultCard({
  result,
  callAttempt,
  lookupStatus,
  tags,
  setCallAttempt
}: {
  result: LookupResult;
  callAttempt: CallAttemptSnapshot | null;
  lookupStatus: LookupStatusValue | null;
  tags: string[];
  setCallAttempt: React.Dispatch<React.SetStateAction<CallAttemptSnapshot | null>>;
}) {
  if (result.state === "cached") {
    return (
      <div className="rounded-lg border border-border bg-secondary/40 p-4 text-left shadow-sm">
        <div className="text-sm font-medium text-secondary-foreground uppercase tracking-wide">
          Direct resultaat
        </div>
        <h3 className="mt-2 text-xl font-semibold">{result.callerName}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{result.summary}</p>
        <div className="mt-3 text-xs text-muted-foreground">
          Nummer: {result.normalized}
        </div>
        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge
                key={tag}
                variant={tag === "bedrijf" ? "secondary" : "outline"}
                className="uppercase tracking-wide"
              >
                {tag === "bedrijf" ? "Bedrijf" : tag === "persoon" ? "Persoon" : tag}
              </Badge>
            ))}
          </div>
        ) : null}
        {isDev && result.debugMessage ? (
          <p className="mt-3 text-xs text-destructive">{result.debugMessage}</p>
        ) : null}
      </div>
    );
  }

  if (result.state === "calling") {
    return (
      <div className="rounded-lg border border-border bg-secondary/20 p-4 text-left shadow-sm">
        <div className="text-sm font-medium text-secondary-foreground uppercase tracking-wide">
          AI-call bezig
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
        <CallProgress
          key={`call-progress-${callAttempt?.updated_at ?? 'none'}-${callAttempt?.status ?? 'none'}`}
          callAttempt={callAttempt}
          lookupStatus={lookupStatus}
          etaSeconds={result.etaSeconds}
        />
        <div className="mt-4 text-xs text-muted-foreground">Nummer: {result.normalized}</div>
        {isDev && result.debugMessage ? (
          <p className="mt-3 text-xs text-destructive">{result.debugMessage}</p>
        ) : null}
      {showDevTools && result.lookupId ? (
        <WebhookSimulator lookupId={result.lookupId} setCallAttempt={setCallAttempt} />
      ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/10 p-4 text-left shadow-sm">
      <div className="text-sm font-medium text-secondary-foreground uppercase tracking-wide">
        Eerste call onderweg
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>
      {lookupStatus ? (
        <p className="mt-2 text-xs text-muted-foreground">Status: {lookupStatus}</p>
      ) : null}
      <div className="mt-3 text-xs text-muted-foreground">
        Nummer: {result.normalized}
      </div>
      {isDev && result.debugMessage ? (
        <p className="mt-3 text-xs text-destructive">{result.debugMessage}</p>
      ) : null}
      {showDevTools && result.lookupId ? (
        <WebhookSimulator lookupId={result.lookupId} setCallAttempt={setCallAttempt} />
      ) : null}
    </div>
  );
}

function DevUtilities({
  isResetting,
  onReset
}: {
  isResetting: boolean;
  onReset: () => void | Promise<void>;
}) {
  return (
    <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-left">
      <div className="text-xs font-semibold uppercase tracking-wide text-destructive">
        Dev only · Gegevens opschonen
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Verwijdert alle call attempts, lookups en profielen uit Supabase. Gebruik dit alleen voor
        lokale tests; in productie is deze actie geblokkeerd.
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-3 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        onClick={() => void onReset()}
        disabled={isResetting}
      >
        {isResetting ? "Bezig met legen…" : "Leeg database"}
      </Button>
    </div>
  );
}

function WebhookSimulator({ 
  lookupId, 
  setCallAttempt 
}: { 
  lookupId: string;
  setCallAttempt: React.Dispatch<React.SetStateAction<CallAttemptSnapshot | null>>;
}) {
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [lastEvent, setLastEvent] = React.useState<string | null>(null);
  const [callerName, setCallerName] = React.useState<string>("");

  const simulateWebhook = async (event: string) => {
    setIsSimulating(true);
    setLastEvent(null);
    
    try {
      console.log("🚀 Starting webhook simulation:", { lookupId, event });
      console.log("🔍 setCallAttempt type:", typeof setCallAttempt, setCallAttempt);
      
      const response = await fetch(`/api/test/webhook-simulation?lookupId=${lookupId}&event=${event}`, {
        method: "POST"
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setLastEvent(event);
        console.log("✅ Webhook simulated:", data);
        
        // If the response contains updated callAttempt data, use it directly
        if (data.callAttempt) {
          const snapshot = buildCallAttemptSnapshot(
            data.callAttempt as ApiCallAttempt,
            null,
            data.lookup?.status as LookupStatusValue | undefined
          );
          setCallAttempt(snapshot);

          const refreshDelayMs = 3000;
          setTimeout(() => {
            if (isDev) {
              console.log("🔄 Triggering delayed refresh after simulator update");
            }
            window.dispatchEvent(new Event("refresh-status"));
          }, refreshDelayMs);
        } else {
          // No callAttempt in response - trigger immediate refresh to fetch it
          if (isDev) {
            console.log("🔄 Triggering immediate refresh (no callAttempt in response)");
          }
          window.dispatchEvent(new Event("refresh-status"));
          
          // Backup refresh after short delay
          setTimeout(() => {
            console.log("🔄 Triggering backup refresh");
            window.dispatchEvent(new Event("refresh-status"));
          }, 1000);
        }
      } else {
        console.error("❌ Webhook simulation failed:", data);
        alert(`Failed to simulate webhook: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("❌ Webhook simulation error:", error);
      alert(`Error simulating webhook: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSimulating(false);
    }
  };

  const replayRealWebhook = async () => {
    setIsSimulating(true);
    setLastEvent(null);
    try {
      console.log("🚀 Replaying real ElevenLabs webhook via dev proxy", { lookupId, callerName });
      const url = new URL(`/api/test/replay-elevenlabs-webhook`, window.location.origin);
      url.searchParams.set("lookupId", lookupId);
      if (callerName.trim()) url.searchParams.set("callerName", callerName.trim());
      const response = await fetch(url.toString(), { method: "POST" });
      const data = await response.json();
      console.log("✅ Webhook replay response:", data);
      // Trigger refresh similar to other simulation
      console.log("🔄 Triggering immediate refresh (replay)");
      window.dispatchEvent(new Event("refresh-status"));
      setTimeout(() => {
        console.log("🔄 Triggering backup refresh (replay)");
        window.dispatchEvent(new Event("refresh-status"));
      }, 1500);
    } catch (error) {
      console.error("❌ Webhook replay error:", error);
      alert(`Error replaying webhook: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="mt-4 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <TestTube className="h-3 w-3" />
        <span>Test Webhook Simulatie</span>
      </div>
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          placeholder="Naam (optioneel)"
          value={callerName}
          onChange={(e) => setCallerName(e.target.value)}
          className="h-7 w-48 rounded border bg-background px-2 text-xs"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={replayRealWebhook}
          disabled={isSimulating}
          className="h-7 text-xs"
          title="Stuurt een echte (gesigneerde) webhook naar het endpoint"
        >
          {isSimulating ? "..." : "🔁 Real webhook"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => simulateWebhook("post_call_transcription")}
          disabled={isSimulating}
          className="h-7 text-xs"
        >
          {isSimulating && lastEvent === "post_call_transcription" ? "..." : "📞 Post Call"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => simulateWebhook("initiating")}
          disabled={isSimulating}
          className="h-7 text-xs"
        >
          {isSimulating && lastEvent === "initiating" ? "..." : "▶️ Initiate"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => simulateWebhook("scheduled")}
          disabled={isSimulating}
          className="h-7 text-xs"
        >
          {isSimulating && lastEvent === "scheduled" ? "..." : "⏸️ Scheduled"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => simulateWebhook("completed")}
          disabled={isSimulating}
          className="h-7 text-xs"
        >
          {isSimulating && lastEvent === "completed" ? "..." : "✅ Completed"}
        </Button>
      </div>
      {lastEvent && (
        <p className="mt-2 text-xs text-muted-foreground">
          Laatste event: <span className="font-medium">{lastEvent}</span> (wacht ~5 sec voor update)
        </p>
      )}
    </div>
  );
}
