"use client";

import * as React from "react";

import { lookupPhoneNumber, type LookupResult } from "@/app/actions/lookup";
import { CallProgress } from "@/components/call-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import type { CallAttemptSnapshot, LookupStatusValue } from "@/lib/lookup-status";
import { validatePhoneNumber } from "@/lib/phone";

function toPlainObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractNameFromPayload(payload?: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  const data = toPlainObject(payload.data);
  const transcript = Array.isArray(data.transcript) ? data.transcript : [];
  for (const entryRaw of transcript) {
    const entry = toPlainObject(entryRaw);
    if (entry.role !== "user" || typeof entry.message !== "string") continue;
    const cleaned = entry.message.replace(/[.!?]+$/, "").trim();
    const match = cleaned.match(
      /\b(?:met|u spreekt met|dit is|je spreekt met|hier is)\s+([A-Z][\p{L}'`\- ]+)/iu
    );
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 1) return name;
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

type FormStatus = "idle" | "validating" | "submitting" | "success" | "error";

const isDev = process.env.NODE_ENV !== "production";

export function LookupForm() {
  const [value, setValue] = React.useState("");
  const [status, setStatus] = React.useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<LookupResult | null>(null);
  const [lookupStatus, setLookupStatus] = React.useState<LookupStatusValue | null>(null);
  const [callAttempt, setCallAttempt] = React.useState<CallAttemptSnapshot | null>(null);
  const [resultTags, setResultTags] = React.useState<string[]>([]);
  const [isPending, startTransition] = React.useTransition();

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

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/lookups/${lookupId}/status?ts=${Date.now()}`, {
          cache: "no-store"
        });

        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (stopped) return;

        const latestStatus = data.lookup?.status as LookupStatusValue | undefined;
        
        // Always update lookup status if available
        if (latestStatus) {
          setLookupStatus((prev) => (prev !== latestStatus ? latestStatus : prev));
        }

        // Always update call attempt if data changed
        if (data.callAttempt) {
          const newCallAttempt = {
            status: data.callAttempt.status,
            elevenlabs_status: data.callAttempt.elevenlabs_status,
            error_message: data.callAttempt.error_message,
            summary: data.callAttempt.summary,
            transcript: data.callAttempt.transcript,
            confidence: data.callAttempt.confidence,
            updated_at: data.callAttempt.updated_at,
            payload: data.callAttempt.payload
          };
          
          // Only update if something actually changed
          setCallAttempt((prev) => {
            if (!prev) return newCallAttempt;
            
            // Check if anything meaningful changed
            const hasChanges =
              prev.status !== newCallAttempt.status ||
              prev.elevenlabs_status !== newCallAttempt.elevenlabs_status ||
              prev.summary !== newCallAttempt.summary ||
              prev.transcript !== newCallAttempt.transcript ||
              prev.confidence !== newCallAttempt.confidence ||
              prev.updated_at !== newCallAttempt.updated_at;
            
            return hasChanges ? newCallAttempt : prev;
          });
        }

        const profile = data.profile ?? null;

        // Check if we have enough data to show a cached result
        const hasProfileData =
          profile &&
          (profile.callerName || profile.summary || profile.transcriptPreview);
        const hasCallAttemptData =
          data.callAttempt &&
          (data.callAttempt.summary || data.callAttempt.transcript);
        
        // Normalize status values to handle edge cases like "b'Success'"
        const normalizeStatusForCheck = (value?: string | null) => {
          if (!value) return "";
          const str = String(value).replace(/^b['"]|['"]$/g, "").trim().toLowerCase();
          return str;
        };
        
        const elevenStatusNormalized = normalizeStatusForCheck(data.callAttempt?.elevenlabs_status);
        const statusNormalized = normalizeStatusForCheck(data.callAttempt?.status);
        
        // Check payload for event information (webhook stores event in payload)
        const payload = data.callAttempt?.payload;
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
          (data.callAttempt &&
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
          const attemptPayload = data.callAttempt?.payload ?? null;
          const derivedName = extractNameFromPayload(attemptPayload);
          const summaryText =
            profile?.summary ??
            data.callAttempt?.summary ??
            data.callAttempt?.transcript ??
            "Samenvatting volgt zodra de agent klaar is.";
          const confidenceValue =
            profile?.confidence ?? data.callAttempt?.confidence ?? null;
          const lastCheckedSource =
            profile?.lastChecked ?? data.callAttempt?.updated_at ?? new Date().toISOString();

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
              (prev.state === "cached" ? prev.callerName : "Onbekende beller");

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
                data.callAttempt?.error_message ??
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

    fetchStatus();
    intervalId = window.setInterval(fetchStatus, 5000);

    return () => {
      stopped = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
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
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          autoComplete="tel"
          autoFocus
          inputMode="tel"
          name="phoneNumber"
          placeholder="+316 123 456 78"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={20}
          aria-invalid={status === "error"}
          aria-describedby="lookup-feedback"
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
        />
      ) : null}
    </form>
  );
}

function ResultCard({
  result,
  callAttempt,
  lookupStatus,
  tags
}: {
  result: LookupResult;
  callAttempt: CallAttemptSnapshot | null;
  lookupStatus: LookupStatusValue | null;
  tags: string[];
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
          callAttempt={callAttempt}
          lookupStatus={lookupStatus}
          etaSeconds={result.etaSeconds}
        />
        <div className="mt-4 text-xs text-muted-foreground">Nummer: {result.normalized}</div>
        {isDev && result.debugMessage ? (
          <p className="mt-3 text-xs text-destructive">{result.debugMessage}</p>
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
    </div>
  );
}
