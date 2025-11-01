import { NextRequest, NextResponse } from "next/server";

import { getLatestCallAttempt } from "@/lib/supabase/call-attempts";
import { fetchProfileByNumber, getLookupById, getProfileById } from "@/lib/supabase/lookups";
import { mapProfileRecord } from "@/lib/supabase/types";

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

  const [callAttempt, profileRecord] = await Promise.all([
    getLatestCallAttempt(lookupId),
    lookup.profile_id ? getProfileById(lookup.profile_id) : null
  ]);

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
