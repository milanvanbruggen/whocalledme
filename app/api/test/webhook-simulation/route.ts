import { NextRequest, NextResponse } from "next/server";
import { updateCallAttemptByConversation, updateCallAttemptByLookupId, getCallAttemptByConversationId } from "@/lib/supabase/call-attempts";
import { getLookupById } from "@/lib/supabase/lookups";

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Test endpoint to simulate webhook events without making actual calls
 * Usage:
 * - POST /api/test/webhook-simulation?lookupId=xxx&event=post_call_transcription
 * - POST /api/test/webhook-simulation?conversationId=xxx&event=post_call_transcription
 */
export async function POST(request: NextRequest) {
  if (!IS_DEV) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const lookupId = searchParams.get("lookupId");
  const conversationId = searchParams.get("conversationId");
  const event = searchParams.get("event") ?? "post_call_transcription";

  if (!lookupId && !conversationId) {
    return NextResponse.json(
      { error: "Missing lookupId or conversationId query parameter" },
      { status: 400 }
    );
  }

  // Determine which lookupId to use
  let effectiveLookupId: string | null = null;
  
  if (conversationId) {
    const attempt = await getCallAttemptByConversationId(conversationId);
    if (attempt) {
      effectiveLookupId = attempt.lookup_id;
    }
  } else if (lookupId) {
    const lookup = await getLookupById(lookupId);
    if (!lookup) {
      return NextResponse.json({ error: "Lookup not found" }, { status: 404 });
    }
    effectiveLookupId = lookupId;
  }

  if (!effectiveLookupId) {
    return NextResponse.json(
      { error: "Could not find lookupId from conversationId or lookupId" },
      { status: 404 }
    );
  }

  // Simulate different webhook events
  const eventConfig = getEventConfig(event);

  if (IS_DEV) {
    console.log("🔧 Webhook simulation starting:", {
      lookupId: effectiveLookupId,
      conversationId,
      event,
      eventConfig
    });
  }

  try {
    let updatedCallAttempt = null;
    
    if (conversationId) {
      const lookupIdResult = await updateCallAttemptByConversation({
        conversationId,
        status: eventConfig.status,
        elevenLabsStatus: eventConfig.elevenLabsStatus,
        payload: eventConfig.payload,
        transcript: eventConfig.transcript,
        summary: eventConfig.summary,
        confidence: eventConfig.confidence
      });
      
      // Fetch the updated call attempt
      if (lookupIdResult) {
        const { getLatestCallAttempt } = await import("@/lib/supabase/call-attempts");
        updatedCallAttempt = await getLatestCallAttempt(lookupIdResult);
      }
    } else {
      if (IS_DEV) {
        console.log("🔧 Calling updateCallAttemptByLookupId with:", {
          lookupId: effectiveLookupId,
          status: eventConfig.status,
          elevenLabsStatus: eventConfig.elevenLabsStatus,
          payload: eventConfig.payload,
          transcript: eventConfig.transcript,
          summary: eventConfig.summary
        });
      }
      
      updatedCallAttempt = await updateCallAttemptByLookupId({
        lookupId: effectiveLookupId,
        status: eventConfig.status,
        elevenLabsStatus: eventConfig.elevenLabsStatus,
        payload: eventConfig.payload,
        transcript: eventConfig.transcript,
        summary: eventConfig.summary,
        confidence: eventConfig.confidence
      });
      
      if (IS_DEV) {
        console.log("🔧 updateCallAttemptByLookupId returned:", updatedCallAttempt);
      }
    }

    if (IS_DEV) {
      console.log("✅ Webhook simulation updated call attempt:", updatedCallAttempt);
    }

    return NextResponse.json({
      success: true,
      message: `Simulated ${event} event`,
      lookupId: effectiveLookupId,
      conversationId: conversationId ?? null,
      eventConfig,
      callAttempt: updatedCallAttempt
    });
  } catch (error) {
    console.error("❌ Error simulating webhook:", error);
    return NextResponse.json(
      { error: "Failed to simulate webhook", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

function getEventConfig(event: string) {
  switch (event.toLowerCase()) {
    case "post_call_transcription":
    case "post-call-transcription":
      return {
        status: "post_call_transcription",
        elevenLabsStatus: "post_call_transcription",
        payload: {
          type: "post_call_transcription",
          event: "post_call_transcription"
        },
        transcript: "Test transcript: Dit is een test transcript van een gesprek.",
        summary: "Test samenvatting: Dit is een test samenvatting van het gesprek.",
        confidence: 0.85
      };

    case "initiating":
    case "initiate":
      return {
        status: "initiating",
        elevenLabsStatus: "initiating",
        payload: {
          type: "conversation_initiation",
          event: "conversation_initiated"
        },
        transcript: null,
        summary: null,
        confidence: null
      };

    case "scheduled":
      return {
        status: "scheduled",
        elevenLabsStatus: "scheduled",
        payload: {
          type: "scheduled",
          event: "scheduled"
        },
        transcript: null,
        summary: null,
        confidence: null
      };

    case "completed":
      return {
        status: "post_call_transcription", // Use status that triggers analysis detection
        elevenLabsStatus: "post_call_transcription",
        payload: {
          type: "post_call_transcription",
          event: "completed"
        },
        transcript: "Test transcript: Gesprek is afgerond.",
        summary: "Test samenvatting: Het gesprek is succesvol afgerond.",
        confidence: 0.9
      };

    default:
      return {
        status: event,
        elevenLabsStatus: event,
        payload: {
          type: event,
          event: event
        },
        transcript: null,
        summary: null,
        confidence: null
      };
  }
}

export async function GET(request: NextRequest) {
  if (!IS_DEV) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  return NextResponse.json({
    message: "Webhook simulation endpoint",
    usage: {
      method: "POST",
      queryParams: {
        lookupId: "ID of the lookup to simulate webhook for",
        conversationId: "ID of the conversation to simulate webhook for",
        event: "Event type to simulate (default: post_call_transcription)"
      },
      examples: [
        "/api/test/webhook-simulation?lookupId=xxx&event=post_call_transcription",
        "/api/test/webhook-simulation?conversationId=xxx&event=initiating",
        "/api/test/webhook-simulation?lookupId=xxx&event=completed"
      ],
      availableEvents: [
        "post_call_transcription",
        "initiating",
        "scheduled",
        "completed"
      ]
    }
  });
}

