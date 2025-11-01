"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, Circle, Loader2 } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import type { CallAttemptSnapshot, LookupStatusValue } from "@/lib/lookup-status";
import { cn } from "@/lib/utils";

const STAGES = [
  {
    id: "scheduled",
    label: "Call ingepland",
    description: "Onze AI-agent zet de Level Labs call klaar."
  },
  {
    id: "analyzing",
    label: "Analyse & transcript",
    description: "We verwerken het gesprek, transcript en samenvatting."
  },
  {
    id: "completed",
    label: "Resultaat beschikbaar",
    description: "Het nummerprofiel wordt automatisch bijgewerkt wanneer alles rond is."
  }
] as const;

type StageId = (typeof STAGES)[number]["id"];
type StageState = "pending" | "active" | "complete" | "error";

const CONNECTED_KEYWORDS = [
  "connect",
  "connecting",
  "dial",
  "dialing",
  "ring",
  "ringing",
  "call_started",
  "call_initiated",
  "call answered",
  "answered",
  "in_progress",
  "in-progress",
  "live",
  "speaking",
  "ongoing",
  "conversation_started"
];

const ANALYSIS_KEYWORDS = [
  "analysis",
  "analysing",
  "analyzing",
  "post_call",
  "post-call",
  "post_call_transcription",
  "post-call-transcription",
  "post_call_analysis",
  "post-call-analysis",
  "transcript",
  "transcribing",
  "transcription",
  "summary",
  "processing"
];

const COMPLETED_KEYWORDS = [
  "complete",
  "completed",
  "finished",
  "success",
  "succeeded",
  "done",
  "resolved",
  "cached"
];

const FAILURE_KEYWORDS = [
  "failed",
  "error",
  "timeout",
  "cancel",
  "canceled",
  "cancelled",
  "hangup",
  "no_answer",
  "no-answer",
  "busy"
];

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Call ingepland",
  initiating: "Call wordt gestart",
  initiate: "Call wordt gestart",
  connecting: "Verbinden met nummer",
  ringing: "Nummer gaat over",
  ringing_answered: "Gesprek gestart",
  call_started: "Gesprek gestart",
  call_initiated: "Gesprek gestart",
  conversation_initiated: "Gesprek wordt gestart",
  in_progress: "Gesprek bezig",
  "in-progress": "Gesprek bezig",
  conversation_started: "Gesprek bezig",
  post_call_analysis_started: "Analyse gestart",
  post_call_analysis_completed: "Analyse afgerond",
  post_call_summary_created: "Samenvatting gegenereerd",
  transcribing: "Transcript wordt gemaakt",
  analysis: "Analyse bezig",
  analyzing: "Analyse bezig",
  completed: "Gesprek afgerond",
  success: "Succesvol afgerond",
  succeeded: "Succesvol afgerond",
  failed: "Gesprek mislukt",
  error: "Fout opgetreden",
  no_answer: "Geen gehoor",
  busy: "Lijn bezet"
};

function normalize(value?: string | null) {
  if (!value) return "";
  // Handle edge cases like "b'Success'" by stripping byte string prefixes
  return String(value).replace(/^b['"]|['"]$/g, "").trim().toLowerCase();
}

function matchesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}

function formatStatusLabel(value?: string | null) {
  if (!value) return null;
  // Handle edge cases like "b'Success'" by stripping byte string prefixes
  const cleaned = String(value).replace(/^b['"]|['"]$/g, "").trim();
  const normalized = cleaned.toLowerCase();
  if (!normalized) return null;
  if (STATUS_LABELS[normalized]) {
    return STATUS_LABELS[normalized];
  }

  const finalCleaned = normalized
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return finalCleaned
    .split(" ")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function determineStageStates({
  callAttempt,
  lookupStatus
}: {
  callAttempt: CallAttemptSnapshot | null;
  lookupStatus: LookupStatusValue | null;
}): { states: Record<StageId, StageState>; activeIndex: number; hasFailure: boolean } {
  // If no call attempt exists yet, show stage 0 (pending)
  if (!callAttempt) {
    return {
      states: {
        scheduled: "pending",
        analyzing: "pending",
        completed: "pending"
      },
      activeIndex: 0,
      hasFailure: false
    };
  }

  const statusValue = normalize(callAttempt?.status);
  const elevenStatusValue = normalize(callAttempt?.elevenlabs_status);
  const combinedStatus = [statusValue, elevenStatusValue].filter(Boolean).join(" ");

  // Check payload for event information (webhook stores event in payload)
  const payload = callAttempt?.payload;
  const payloadEvent = payload && typeof payload === "object" && "event" in payload 
    ? normalize(String(payload.event))
    : "";
  const payloadType = payload && typeof payload === "object" && "type" in payload
    ? normalize(String(payload.type))
    : "";
  
  const combinedStatusWithPayload = [combinedStatus, payloadEvent, payloadType].filter(Boolean).join(" ");

  const hasFailure =
    lookupStatus === "failed" || matchesAny(combinedStatusWithPayload, FAILURE_KEYWORDS);

  // Determine which stage we're at based on sequential progression
  let activeIndex = 0; // Start at stage 0 (scheduled)

  // Stage 0: Scheduled (always true if callAttempt exists)
  // Stage 1: Analysis - check if call is being analyzed or post-call transcription is happening
  
  const hasAnalysisStarted = matchesAny(combinedStatusWithPayload, ANALYSIS_KEYWORDS);
  const hasCompletedData = callAttempt?.summary || callAttempt?.transcript;
  
  // Check for post-call events (indicates webhook has processed the call)
  // This includes post_call_transcription which is the main event we're looking for
  const hasPostCallEvent = 
    matchesAny(combinedStatusWithPayload, [
      "post_call",
      "post-call",
      "post_call_transcription",
      "post-call-transcription",
      "post_call_analysis",
      "post-call-analysis",
      "transcription",
      "transcribing"
    ]);

  // Stage 2: Completed - check if truly completed
  // Only mark as completed if:
  // 1. Lookup status is cached (definitive)
  // 2. OR we have completed keywords AND completed data
  // 3. OR we have post-call event AND completed data (webhook just processed it)
  const hasCompleted =
    lookupStatus === "cached" ||
    (matchesAny(combinedStatusWithPayload, COMPLETED_KEYWORDS) && hasCompletedData) ||
    (hasPostCallEvent && hasCompletedData);

  // Check if status is just "scheduled" - don't advance stages yet
  const isJustScheduled = 
    statusValue === "scheduled" || 
    elevenStatusValue === "scheduled" ||
    (statusValue === "" && elevenStatusValue === "");

  // Determine active stage sequentially (skip dialing stage)
  if (hasCompleted && hasCompletedData) {
    // All done - show stage 2 as complete (only if we have actual data)
    activeIndex = 2;
  } else if (hasAnalysisStarted || hasPostCallEvent || hasCompletedData) {
    // Analysis stage - we have data being processed OR post-call events (webhook processing)
    // This is triggered immediately when post_call_transcription webhook is received
    activeIndex = 1;
  } else if (isJustScheduled) {
    // Just scheduled - stay at stage 0
    activeIndex = 0;
  } else {
    // If we have any status that's not scheduled, assume analysis has started
    activeIndex = 1;
  }

  const stageEntries = STAGES.map((stage, index) => {
    let state: StageState = "pending";

    if (index < activeIndex) {
      // Previous stages are complete
      state = "complete";
    } else if (index === activeIndex) {
      // Current stage
      if (hasFailure) {
        state = "error";
      } else if (hasCompleted && index === 2) {
        // Final stage is complete (index 2 = completed stage)
        state = "complete";
      } else {
        state = "active";
      }
    } else {
      // Future stages are pending
      state = "pending";
    }

    return [stage.id, state] as const;
  });

  return {
    states: Object.fromEntries(stageEntries) as Record<StageId, StageState>,
    activeIndex,
    hasFailure
  };
}

function computeProgressPercentage(stageStates: Record<StageId, StageState>, activeIndex: number) {
  const highestCompleteIndex = STAGES.reduce((max, stage, index) => {
    const state = stageStates[stage.id];
    if (state === "complete") {
      return Math.max(max, index);
    }
    return max;
  }, -1);

  const baseIndex = Math.max(highestCompleteIndex, activeIndex);
  const totalSteps = STAGES.length - 1;

  if (totalSteps <= 0) {
    return 100;
  }

  const clampedIndex = Math.min(Math.max(baseIndex, 0), STAGES.length - 1);
  return Math.round((clampedIndex / totalSteps) * 100);
}

export interface CallProgressProps {
  callAttempt: CallAttemptSnapshot | null;
  lookupStatus: LookupStatusValue | null;
  etaSeconds?: number;
}

export function CallProgress({ callAttempt, lookupStatus, etaSeconds }: CallProgressProps) {
  const { states, activeIndex, hasFailure } = React.useMemo(
    () => determineStageStates({ callAttempt, lookupStatus }),
    [callAttempt, lookupStatus]
  );

  const progress = React.useMemo(
    () => computeProgressPercentage(states, activeIndex),
    [states, activeIndex]
  );

  const latestStatusLabel = formatStatusLabel(
    callAttempt?.elevenlabs_status ?? 
    callAttempt?.status ?? 
    (callAttempt?.payload && typeof callAttempt.payload === "object" && "event" in callAttempt.payload 
      ? String(callAttempt.payload.event)
      : callAttempt?.payload && typeof callAttempt.payload === "object" && "type" in callAttempt.payload
      ? String(callAttempt.payload.type)
      : null)
  );
  const updatedAtLabel = callAttempt?.updated_at ? formatDateTime(callAttempt.updated_at) : null;

  const etaLabel = (() => {
    if (!etaSeconds || etaSeconds <= 0) return null;
    if (etaSeconds >= 60) {
      const minutes = Math.round(etaSeconds / 60);
      return `Binnen circa ${minutes} minuut${minutes > 1 ? "en" : ""} klaar.`;
    }
    return `Binnen ongeveer ${etaSeconds} seconden klaar.`;
  })();

  return (
    <div className="mt-4 space-y-5">
      <div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Stap {Math.min(activeIndex + 1, STAGES.length)} van {STAGES.length}
        </div>
      </div>

      <ul className="space-y-4">
        {STAGES.map((stage, index) => {
          const state = states[stage.id];
          const isActive = state === "active";
          const isComplete = state === "complete";
          const isError = state === "error";

          const icon = (() => {
            if (isComplete) {
              return <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />;
            }
            if (isError) {
              return <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />;
            }
            if (isActive) {
              return <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />;
            }
            return <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />;
          })();

          return (
            <li key={stage.id} className="flex items-start gap-3">
              <span className="mt-0.5">{icon}</span>
              <div>
                <div
                  className={cn(
                    "text-sm font-medium",
                    isComplete ? "text-foreground" : isActive ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {stage.label}
                </div>
                <div className="text-xs text-muted-foreground">{stage.description}</div>
                {index === activeIndex && latestStatusLabel ? (
                  <div className="mt-1 text-xs text-primary">
                    {latestStatusLabel}
                    {updatedAtLabel ? ` · ${updatedAtLabel}` : ""}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {etaLabel ? <div className="text-xs text-muted-foreground">{etaLabel}</div> : null}

      {hasFailure && callAttempt?.error_message ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {callAttempt.error_message}
        </div>
      ) : null}
    </div>
  );
}

