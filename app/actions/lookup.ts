"use server";

import { formatDateTime } from "@/lib/format";
import { phoneLookupSchema } from "@/lib/phone";
import { startOutboundCall } from "@/lib/elevenlabs";
import { recordCallAttempt } from "@/lib/supabase/call-attempts";
import { fetchProfileWithRecord, recordLookup } from "@/lib/supabase/lookups";
import type { LookupStatus } from "@/lib/supabase/types";

export type LookupResult =
  | {
      state: "cached";
      normalized: string;
      callerName: string;
      lastChecked: string;
      summary: string;
      confidence: number;
      lookupId?: string;
      debugMessage?: string;
    }
  | {
      state: "calling";
      normalized: string;
      etaSeconds: number;
      message: string;
      lookupId: string;
      debugMessage?: string;
    }
  | {
      state: "not_found";
      normalized: string;
      message: string;
      lookupId?: string;
      debugMessage?: string;
    };

const isDev = process.env.NODE_ENV !== "production";

export async function lookupPhoneNumber(input: { phoneNumber: string }): Promise<LookupResult> {
  const rawInput = input.phoneNumber;
  const { phoneNumber: normalized } = phoneLookupSchema.parse(input);

  // Simulate network latency to mirror real call scheduling.
  await new Promise((resolve) => setTimeout(resolve, 900));

  let status: LookupStatus = "calling";
  let profileId: string | null = null;

  const supabaseProfile = await fetchProfileWithRecord(normalized);

  if (supabaseProfile) {
    const { profile, record } = supabaseProfile;
    status = "cached";
    profileId = record.id;

    let cachedLookupId: string | null = null;
    try {
      cachedLookupId = await recordLookup({
        normalized,
        rawInput,
        status,
        profileId
      });
    } catch (error) {
      const debugMessage =
        error instanceof Error ? error.message : "Onbekende fout tijdens Supabase-opslaan.";

      return {
        state: "cached",
        normalized,
        callerName: profile.callerName,
        lastChecked: formatDateTime(profile.lastChecked),
        summary: profile.summary,
        confidence: profile.confidence,
        lookupId: cachedLookupId ?? undefined,
        debugMessage: isDev ? debugMessage : undefined
      };
    }

    return {
      state: "cached",
      normalized,
      callerName: profile.callerName,
      lastChecked: formatDateTime(profile.lastChecked),
      summary: profile.summary,
      confidence: profile.confidence,
      lookupId: cachedLookupId ?? undefined
    };
  }

  status = "calling";
  let lookupId: string;

  try {
    lookupId = (await recordLookup({
      normalized,
      rawInput,
      status,
      profileId
    })) as string;
  } catch (error) {
    const debugMessage =
      error instanceof Error ? error.message : "Onbekende fout tijdens Supabase-opslaan.";

    return {
      state: "not_found",
      normalized,
      message: "We konden je lookup niet registreren. Probeer het later opnieuw.",
      debugMessage: isDev ? debugMessage : undefined
    };
  }

  if (!lookupId) {
    const debugMessage = "Geen lookup-id ontvangen van Supabase.";
    return {
      state: "not_found",
      normalized,
      message: "We konden je lookup niet registreren. Probeer het later opnieuw.",
      debugMessage: isDev ? debugMessage : undefined
    };
  }

  try {
    // In development mode, skip actual ElevenLabs calls to allow testing without real calls
    const DISABLE_ELEVENLABS_CALLS = process.env.DISABLE_ELEVENLABS_CALLS === "true" || isDev;
    
    let response: { success: boolean; message?: string; conversation_id: string | null; callSid?: string | null };
    
    if (DISABLE_ELEVENLABS_CALLS) {
      // Mock response for testing - generates a fake conversation_id
      const mockConversationId = `mock_conv_${lookupId}_${Date.now()}`;
      response = {
        success: true,
        message: "Mock call scheduled (ElevenLabs calls disabled for testing)",
        conversation_id: mockConversationId,
        callSid: `mock_call_${Date.now()}`
      };
      
      if (isDev) {
        console.log("🔧 Mock call created (ElevenLabs calls disabled):", {
          lookupId,
          conversationId: mockConversationId,
          phoneNumber: normalized
        });
      }
    } else {
      // Real call
      response = await startOutboundCall({
        phoneNumber: normalized,
        metadata: {
          lookupId,
          source: "web_lookup",
          normalized,
          rawInput
        }
      });
    }

    await recordCallAttempt({
      lookupId,
      status: "scheduled",
      conversationId: response.conversation_id,
      elevenLabsStatus: response.message ?? null,
      payload: {
        callSid: response.callSid ?? null,
        mock: DISABLE_ELEVENLABS_CALLS ? true : undefined
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onbekende fout";
    await recordCallAttempt({
      lookupId,
      status: "failed",
      errorMessage: message
    });

    return {
      state: "not_found",
      normalized,
      message: "We konden de call niet starten. Probeer het later opnieuw.",
      lookupId,
      debugMessage: isDev ? message : undefined
    };
  }

  return {
    state: "calling",
    normalized,
    etaSeconds: 60,
    message: "Onze AI-agent belt het nummer nu. Binnen enkele minuten staat het resultaat hier.",
    lookupId
  };
}
