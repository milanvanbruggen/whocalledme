import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { getLookupById } from "@/lib/supabase/lookups";

const IS_DEV = process.env.NODE_ENV !== "production";
const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET || "dev-secret";

function signBody(rawBody: string, timestampSec: number): string {
  const payloadToSign = `${timestampSec}.${rawBody}`;
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  hmac.update(payloadToSign, "utf8");
  const hex = hmac.digest("hex");
  return `t=${timestampSec},v0=${hex}`;
}

export async function POST(request: NextRequest) {
  if (!IS_DEV) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  // Optional: client can post a full raw JSON body to replay exactly
  let rawBody = await request.text();
  let usedProvidedBody = false;

  if (!rawBody || rawBody.trim().length === 0) {
    // Build a realistic default payload from current lookup
    const lookupId = request.nextUrl.searchParams.get("lookupId");
    const conversationId =
      request.nextUrl.searchParams.get("conversationId") ?? `conv_mock_${Date.now()}`;
    const callerName = request.nextUrl.searchParams.get("callerName") ?? "Onbekende beller";
    const status = request.nextUrl.searchParams.get("status") ?? "done";

    if (!lookupId) {
      return NextResponse.json({ error: "Missing lookupId" }, { status: 400 });
    }

    const lookup = await getLookupById(lookupId);
    if (!lookup) {
      return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
    }

    const body = {
      type: "post_call_transcription",
      event_timestamp: Math.floor(Date.now() / 1000),
      data: {
        agent_id: process.env.ELEVENLABS_AGENT_ID ?? "agent_dev",
        conversation_id: conversationId,
        status,
        transcript: [
          { role: "agent", message: "Test: met wie spreek ik?" },
          { role: "user", message: callerName }
        ],
        // Mimic ElevenLabs structure: include original initiation client data with dynamic variables
        conversation_initiation_client_data: {
          dynamic_variables: {
            lookupId,
            source: "web_lookup",
            normalized: lookup.normalized
          }
        },
        contact: { caller_name: callerName },
        analysis: {
          data_collection_results: {
            name: { value: callerName },
            consent: { value: "true" },
            organisation: { value: "false" }
          },
          transcript_summary: `Samenvatting: beller genoemd als ${callerName}.`
        }
      },
      metadata: {
        normalized: lookup.normalized,
        summary: `Naam bevestigd: ${callerName}`
      }
    };

    rawBody = JSON.stringify(body);
  } else {
    usedProvidedBody = true;
  }

  const now = Math.floor(Date.now() / 1000);
  const signature = signBody(rawBody, now);

  // Forward to the real webhook endpoint to exercise the same path + signature check
  const targetUrl = new URL("/api/webhooks/elevenlabs", request.url);
  const resp = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Elevenlabs-Signature": signature
    },
    body: rawBody
  });

  const text = await resp.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return NextResponse.json({
    success: resp.ok,
    status: resp.status,
    usedProvidedBody,
    forwardedTo: targetUrl.toString(),
    signature,
    bodyPreview: rawBody.substring(0, 3000),
    response: parsed
  });
}

export async function GET() {
  if (!IS_DEV) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  return NextResponse.json({
    message: "Replay ElevenLabs webhook (dev-only)",
    usage: {
      method: "POST",
      options: [
        "POST raw JSON identical to ElevenLabs",
        "Or call with ?lookupId=...&callerName=... to auto-generate a realistic payload"
      ]
    }
  });
}


