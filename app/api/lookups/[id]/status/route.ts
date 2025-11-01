import { NextRequest, NextResponse } from "next/server";

import { getLatestCallAttempt } from "@/lib/supabase/call-attempts";
import { fetchProfileByNumber, getLookupById, getProfileById } from "@/lib/supabase/lookups";
import { mapProfileRecord } from "@/lib/supabase/types";

const IS_DEV = process.env.NODE_ENV !== "production";

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const lookupId = context.params?.id;

  if (!lookupId) {
    return NextResponse.json({ error: "Missing lookup id" }, { status: 400 });
  }

  const lookup = await getLookupById(lookupId);

  if (!lookup) {
    return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
  }

  // Add a small delay to ensure database consistency after writes
  // This helps avoid read-after-write consistency issues with Supabase
  const hasRecentUpdate = _request.nextUrl.searchParams.get('ts');
  if (hasRecentUpdate && IS_DEV) {
    // If this is a poll request shortly after an update, add tiny delay
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const [callAttempt, profileRecord] = await Promise.all([
    getLatestCallAttempt(lookupId),
    lookup.profile_id ? getProfileById(lookup.profile_id) : null
  ]);

  if (IS_DEV && callAttempt) {
    console.log("📡 Status endpoint returning:", {
      lookupId,
      callAttemptId: callAttempt.id,
      callAttemptStatus: callAttempt.status,
      callAttemptElevenLabsStatus: callAttempt.elevenlabs_status,
      callAttemptPayload: callAttempt.payload,
      hasTranscript: !!callAttempt.transcript,
      hasSummary: !!callAttempt.summary,
      updatedAt: callAttempt.updated_at
    });
  }

  let profile = profileRecord ? mapProfileRecord(profileRecord) : null;

  if (!profile) {
    profile = await fetchProfileByNumber(lookup.normalized);
  }

  return NextResponse.json({
    lookup,
    callAttempt,
    profile
  });
}
