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
    // Check if DEV_DEBUG is enabled (or legacy DISABLE_ELEVENLABS_CALLS for backward compatibility)
    // DEV_DEBUG=true means use mock calls (for debugging/testing without API costs)
    // DEV_DEBUG=false means use real ElevenLabs calls (same as production behavior)
    // DEV_DEBUG not set: in dev use mock calls, in production use real calls
    // In production, always use real calls regardless of DEV_DEBUG setting
    
    // Read environment variables with proper normalization
    const rawDevDebug = process.env.DEV_DEBUG;
    const rawDisableCalls = process.env.DISABLE_ELEVENLABS_CALLS; // Legacy support
    const DEV_DEBUG_VALUE = rawDevDebug?.toLowerCase().trim();
    const DISABLE_CALLS_VALUE = rawDisableCalls?.toLowerCase().trim();
    const isProduction = process.env.NODE_ENV === "production";
    
    // Determine whether to use mock calls:
    // Priority: DEV_DEBUG > DISABLE_ELEVENLABS_CALLS (legacy)
    // - Production: always use real calls
    // - Development: 
    //   - If DEV_DEBUG is explicitly "true", use mock calls
    //   - If DEV_DEBUG is explicitly "false", use real calls
    //   - If DEV_DEBUG is not set, check legacy DISABLE_ELEVENLABS_CALLS
    //   - If neither is set, use mock calls (default behavior)
    const DEV_DEBUG_ENABLED = DEV_DEBUG_VALUE === "true";
    const DEV_DEBUG_DISABLED = DEV_DEBUG_VALUE === "false";
    
    // Legacy support: DISABLE_ELEVENLABS_CALLS=true means disable (use mock), false means enable (use real)
    const LEGACY_DISABLE_CALLS = DISABLE_CALLS_VALUE === "true";
    const LEGACY_ENABLE_CALLS = DISABLE_CALLS_VALUE === "false";
    
    // In production, always use real calls
    // In development: determine based on DEV_DEBUG or legacy variable
    let USE_MOCK_CALLS: boolean;
    if (isProduction) {
      USE_MOCK_CALLS = false; // Always real calls in production
    } else if (DEV_DEBUG_VALUE !== undefined) {
      // DEV_DEBUG is explicitly set (true or false)
      // DEV_DEBUG=true means use mock calls, DEV_DEBUG=false means use real calls
      USE_MOCK_CALLS = DEV_DEBUG_ENABLED;
    } else if (DISABLE_CALLS_VALUE !== undefined) {
      // Legacy: DISABLE_ELEVENLABS_CALLS is set
      USE_MOCK_CALLS = LEGACY_DISABLE_CALLS;
    } else {
      // Neither is set: default to mock calls in dev
      USE_MOCK_CALLS = true;
    }
    
    // Always log in development for debugging
    if (isDev) {
      console.log("🔍 Call configuration:", {
        DEV_DEBUG: {
          rawValue: rawDevDebug,
          normalizedValue: DEV_DEBUG_VALUE,
          isEnabled: DEV_DEBUG_ENABLED,
          isDisabled: DEV_DEBUG_DISABLED
        },
        legacy_DISABLE_ELEVENLABS_CALLS: {
          rawValue: rawDisableCalls,
          normalizedValue: DISABLE_CALLS_VALUE,
          isDisabled: LEGACY_DISABLE_CALLS,
          isEnabled: LEGACY_ENABLE_CALLS
        },
        result: {
          isProduction,
          useMockCalls: USE_MOCK_CALLS,
          willUseRealCalls: !USE_MOCK_CALLS
        },
        phoneNumber: normalized,
        allEnvKeys: Object.keys(process.env).filter(key => 
          key.includes("DEV") || key.includes("DEBUG") || key.includes("DISABLE_ELEVENLABS")
        )
      });
    }
    
    let response: { success: boolean; message?: string; conversation_id: string | null; callSid?: string | null };
    
    if (USE_MOCK_CALLS) {
      // Mock response for testing - generates a fake conversation_id
      const mockConversationId = `mock_conv_${lookupId}_${Date.now()}`;
      response = {
        success: true,
        message: "Mock call scheduled (ElevenLabs calls disabled for testing)",
        conversation_id: mockConversationId,
        callSid: `mock_call_${Date.now()}`
      };
      
      if (isDev) {
        console.log("🔧 Mock call created (DEV_DEBUG=true):", {
          lookupId,
          conversationId: mockConversationId,
          phoneNumber: normalized
        });
      }
    } else {
      // Real call
      if (isDev) {
        console.log("📞 Starting real ElevenLabs call:", {
          phoneNumber: normalized,
          lookupId,
          hasApiKey: !!process.env.ELEVENLABS_API_KEY,
          hasAgentId: !!process.env.ELEVENLABS_AGENT_ID,
          hasPhoneNumberId: !!process.env.ELEVENLABS_PHONE_NUMBER_ID
        });
      }
      
      try {
        response = await startOutboundCall({
          phoneNumber: normalized,
          metadata: {
            lookupId,
            source: "web_lookup",
            normalized,
            rawInput
          }
        });
        
        if (isDev) {
          console.log("✅ ElevenLabs call started successfully:", {
            conversationId: response.conversation_id,
            callSid: response.callSid,
            message: response.message
          });
        }
      } catch (callError) {
        const errorMessage = callError instanceof Error ? callError.message : String(callError);
        if (isDev) {
          console.error("❌ ElevenLabs call failed:", {
            error: errorMessage,
            phoneNumber: normalized,
            lookupId
          });
        }
        throw callError; // Re-throw to be caught by outer try-catch
      }
    }

    await recordCallAttempt({
      lookupId,
      status: "scheduled",
      conversationId: response.conversation_id,
      elevenLabsStatus: response.message ?? null,
      payload: {
        callSid: response.callSid ?? null,
        mock: USE_MOCK_CALLS ? true : undefined
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
