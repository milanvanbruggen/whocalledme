const rawApiKey = process.env.ELEVENLABS_API_KEY;
const rawAgentId = process.env.ELEVENLABS_AGENT_ID;
const rawPhoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

if (!rawApiKey) {
  throw new Error("ELEVENLABS_API_KEY is not set");
}

if (!rawAgentId) {
  throw new Error("ELEVENLABS_AGENT_ID is not set");
}

if (!rawPhoneNumberId) {
  throw new Error("ELEVENLABS_PHONE_NUMBER_ID is not set");
}

const ELEVENLABS_API_KEY = rawApiKey;
const ELEVENLABS_AGENT_ID = rawAgentId;
const ELEVENLABS_PHONE_NUMBER_ID = rawPhoneNumberId;

interface StartCallParams {
  phoneNumber: string;
  metadata?: Record<string, unknown>;
}

interface ElevenLabsCallResponse {
  success: boolean;
  message: string;
  conversation_id: string | null;
  callSid?: string | null;
}

export async function startOutboundCall({
  phoneNumber,
  metadata = {}
}: StartCallParams): Promise<ElevenLabsCallResponse> {
  const dynamicVariables =
    Object.keys(metadata).length > 0 ? { dynamic_variables: metadata } : undefined;

  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      agent_id: ELEVENLABS_AGENT_ID,
      agent_phone_number_id: ELEVENLABS_PHONE_NUMBER_ID,
      to_number: phoneNumber,
      conversation_initiation_client_data: dynamicVariables
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `ElevenLabs call failed with status ${response.status}: ${errorText || response.statusText}`
    );
  }

  const result = (await response.json()) as ElevenLabsCallResponse;
  if (!result.success) {
    throw new Error(result.message || "ElevenLabs call failed");
  }

  return result;
}
