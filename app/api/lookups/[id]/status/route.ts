import { NextRequest, NextResponse } from "next/server";

import { getLatestCallAttempt } from "@/lib/supabase/call-attempts";
import { fetchProfileByNumber, getLookupById, getProfileById } from "@/lib/supabase/lookups";
import { mapProfileRecord, type CallAttemptRecord } from "@/lib/supabase/types";
import type { CallAttemptSnapshot, LookupStatusValue } from "@/lib/lookup-status";
import { generateETag } from "@/lib/cache/status-cache";

const IS_DEV = process.env.NODE_ENV !== "production";

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const lookupId = context.params?.id;

  if (!lookupId) {
    return NextResponse.json({ error: "Missing lookup id" }, { status: 400 });
  }

  // Check if client has ETag (for conditional requests)
  const ifNoneMatch = request.headers.get("if-none-match");

  // Always fetch fresh data from database (no cache)
  const lookup = await getLookupById(lookupId);

  if (!lookup) {
    return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
  }

  // Add a delay to ensure database consistency after updates
  // This helps avoid read-after-write consistency issues with Supabase
  await new Promise(resolve => setTimeout(resolve, 500)); // Initial delay

  // Fetch data with retry logic - check every second until we get fresh data
  let rawCallAttempt: CallAttemptRecord | null = null;
  let profileRecord: ReturnType<typeof getProfileById> extends Promise<infer T> ? T : never = null;
  let retries = 0;
  const maxRetries = 10; // Maximum 10 seconds of retries
  let lastCallAttemptUpdatedAt: string | null = null;
  let lastLookupStatus: string | null = lookup.status;
  const startTime = Date.now();

  while (retries < maxRetries) {
    const [attempt, profile, freshLookup] = await Promise.all([
      getLatestCallAttempt(lookupId),
      lookup.profile_id ? getProfileById(lookup.profile_id) : null,
      getLookupById(lookupId)
    ]);

    rawCallAttempt = attempt;
    profileRecord = profile;

    // Check if lookup status was updated
    const lookupStatusChanged = freshLookup && freshLookup.status !== lastLookupStatus;
    
    // Check if call attempt was updated recently
    const callAttemptUpdatedAt = rawCallAttempt?.updated_at ?? null;
    const callAttemptGotNewer = callAttemptUpdatedAt && 
      (!lastCallAttemptUpdatedAt || callAttemptUpdatedAt > lastCallAttemptUpdatedAt);
    
    // Check if we're getting stale data - if lookup is 'cached' but call attempt is still 'scheduled', we need to retry
    const gotStaleData = freshLookup?.status === "cached" && rawCallAttempt?.status === "scheduled";
    
    // Also check if we got newer data but it's still not complete
    const hasNewDataButIncomplete = callAttemptGotNewer && 
      rawCallAttempt?.status === "post_call_transcription" && 
      (!rawCallAttempt?.summary || !rawCallAttempt?.transcript);

    // Determine if we should retry
    const shouldRetry = lookupStatusChanged || gotStaleData || hasNewDataButIncomplete;

    if (shouldRetry && retries < maxRetries - 1) {
      // Data changed or we got stale data, update our reference and retry to get fresh data
      if (IS_DEV) {
        console.log(`⚠️ Retrying fetch (attempt ${retries + 1}/${maxRetries}) - checking every second`, {
          lookupId,
          lookupStatusChanged: lookupStatusChanged ? {
            old: lastLookupStatus,
            new: freshLookup?.status
          } : null,
          callAttemptGotNewer: callAttemptGotNewer ? {
            old: lastCallAttemptUpdatedAt,
            new: callAttemptUpdatedAt
          } : null,
          currentCallAttemptStatus: rawCallAttempt?.status,
          currentLookupStatus: freshLookup?.status,
          gotStaleData,
          hasNewDataButIncomplete,
          elapsedSeconds: Math.round((Date.now() - startTime) / 1000)
        });
      }
      
      if (freshLookup) {
        lookup.status = freshLookup.status;
        lookup.profile_id = freshLookup.profile_id;
        lastLookupStatus = freshLookup.status;
      }
      lastCallAttemptUpdatedAt = callAttemptUpdatedAt;
      
      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      retries++;
      continue;
    }

    // If we got fresh data, break
    lastCallAttemptUpdatedAt = callAttemptUpdatedAt;
    if (freshLookup) {
      lookup.status = freshLookup.status;
      lookup.profile_id = freshLookup.profile_id;
    }
    break;
  }

  // Fetch profile - try both by profile_id and by normalized number
  // This ensures we get the profile even if profile_id isn't set yet but profile exists
  const profileFromDb = profileRecord ? mapProfileRecord(profileRecord) : null;
  let profileByNumber = null;
  
  // If lookup status is 'cached' but we don't have a profile yet, fetch by number
  // This handles the case where profile was created but lookup.profile_id isn't updated yet
  if (!profileFromDb && (lookup.status === "cached" || lookup.status === "calling")) {
    profileByNumber = await fetchProfileByNumber(lookup.normalized);
  }
  
  const profile = profileFromDb ?? profileByNumber;

  // Always log profile data for production debugging
  console.log("📋 Profile data in API", {
    lookupId,
    profileId: lookup.profile_id,
    lookupStatus: lookup.status,
    profileFromDb: profileFromDb ? {
      callerName: profileFromDb.callerName,
      normalized: profileFromDb.normalized
    } : null,
    profileByNumber: profileByNumber ? {
      callerName: profileByNumber.callerName,
      normalized: profileByNumber.normalized
    } : null,
    profile: profile ? {
      callerName: profile.callerName,
      normalized: profile.normalized
    } : null
  });

  const buildSnapshot = (
    raw: CallAttemptRecord | null,
    currentProfile: typeof profile,
    lookupStatus: string | null
  ): CallAttemptSnapshot | null => {
    const isCached = (lookupStatus as LookupStatusValue | undefined) === "cached";

    if (!raw && !isCached && !currentProfile) {
      return null;
    }

    const payloadBase: Record<string, unknown> =
      raw && raw.payload && typeof raw.payload === "object"
        ? { ...raw.payload }
        : {};

    if (isCached && !raw) {
      // Only add default payload if we don't have actual call attempt data
      if (!("event" in payloadBase)) {
        payloadBase.event = "post_call_transcription";
      }
      if (!("type" in payloadBase)) {
        payloadBase.type = "post_call_transcription";
      }
    }

    const summaryValue =
      raw?.summary ??
      currentProfile?.summary ??
      currentProfile?.transcriptPreview ??
      raw?.transcript ??
      null;

    const transcriptValue = raw?.transcript ?? currentProfile?.transcriptPreview ?? null;
    const confidenceValue = raw?.confidence ?? currentProfile?.confidence ?? null;
    const updatedAtValue = raw?.updated_at ?? currentProfile?.lastChecked ?? new Date().toISOString();

    return {
      status: isCached && !raw ? "post_call_transcription" : raw?.status ?? null,
      elevenlabs_status: isCached && !raw ? "post_call_transcription" : raw?.elevenlabs_status ?? null,
      error_message: raw?.error_message ?? null,
      summary: summaryValue,
      transcript: transcriptValue,
      confidence: confidenceValue ?? null,
      updated_at: updatedAtValue,
      payload: Object.keys(payloadBase).length > 0 ? payloadBase : raw?.payload ?? null
    };
  };

  const snapshot = buildSnapshot(rawCallAttempt, profile, lookup.status);

  // Generate ETag from latest updated_at (prefer callAttempt, fallback to lookup, then current time)
  // This ensures ETag changes when data actually changes
  const latestUpdatedAt = rawCallAttempt?.updated_at ?? 
                          (lookup.status === "cached" ? new Date().toISOString() : null) ?? 
                          new Date().toISOString();
  const etag = generateETag(latestUpdatedAt);

  // Check if client has matching ETag (304 Not Modified)
  if (ifNoneMatch && ifNoneMatch === etag) {
    if (IS_DEV) {
      console.log("✅ Returning 304 Not Modified", { lookupId, etag: ifNoneMatch });
    }
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  }

  const responseData = {
    lookup,
    callAttempt: snapshot,
    profile
  };

  // Always log response data for production debugging
  console.log("✅ Fresh data fetched (no cache)", {
    lookupId,
    lookupStatus: lookup.status,
    callAttemptStatus: snapshot?.status,
    callAttemptElevenLabsStatus: snapshot?.elevenlabs_status,
    hasSummary: !!snapshot?.summary,
    hasTranscript: !!snapshot?.transcript,
    etag,
    latestUpdatedAt,
    callAttemptUpdatedAt: rawCallAttempt?.updated_at ?? null,
    retries
  });

  return NextResponse.json(responseData, {
    headers: {
      ETag: etag,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Last-Modified": new Date(latestUpdatedAt).toUTCString()
    }
  });
}
