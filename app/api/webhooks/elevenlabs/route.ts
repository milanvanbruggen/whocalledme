import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { parsePhoneNumber } from "@/lib/phone";
import {
  updateCallAttemptByConversation,
  updateCallAttemptByLookupId,
  getCallAttemptByConversationId
} from "@/lib/supabase/call-attempts";
import {
  fetchProfileRecordByNumber,
  getLookupById,
  getProfileById,
  updateLookupStatus,
  upsertPhoneProfile,
  getLatestLookupByNormalized,
  type UpsertProfileInput
} from "@/lib/supabase/lookups";
import type {
  LookupStatus,
  PhoneProfileRecord,
  ProfileCallOutcome
} from "@/lib/supabase/types";

const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;

const IS_DEV = process.env.NODE_ENV !== "production";

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

const BUSINESS_ENTITY_TYPES = new Set([
  "business",
  "company",
  "organization",
  "organisation",
  "business_name",
  "company_name",
  "org",
  "business_entity",
  "corporate"
]);

const PERSON_ENTITY_TYPES = new Set([
  "person",
  "individual",
  "human",
  "person_name",
  "caller_name",
  "contact_name"
]);

const GENERIC_CALLER_LABELS = new Set(
  [
    "onbekende beller",
    "unknown caller",
    "unknown",
    "n.v.t",
    "nvt",
    "n/a",
    "not available",
    "niet beschikbaar",
    "niet bekend",
    "geen naam",
    "unknown person",
    "unknown name",
    "business",
    "company",
    "organization",
    "organisation",
    "bedrijf",
    "bedrijfsnaam",
    "company name",
    "anonymous",
    "anoniem",
    "private caller",
    "private number"
  ].map((label) => label.toLowerCase())
);

const ALLOWED_CALLER_ROLES = new Set([
  "user",
  "customer",
  "caller",
  "callee",
  "lead",
  "contact",
  "prospect",
  "human"
]);

const TRANSCRIPT_NAME_PATTERNS = [
  /\b(?:met|u spreekt met|je spreekt met|ik ben|dit is|hier is|spreek je met|je praat met)\s+([A-Z][\p{L}'`\- ]{1,80})/giu,
  /\b(?:mijn naam is|my name is|this is)\s+([A-Z][\p{L}'`\- ]{1,80})/giu
];

const SUMMARY_PERSON_PATTERNS = [
  /\b(?:de\s+|het\s+|the\s+)?(?:user|caller|contact|persoon|klant|gebruiker)\b[,:\s]+(?:met\s+naam\s+|named\s+|called\s+|genaamd\s+)?([A-Z][\p{L}'`\- ]{1,80})/giu
];

const SUMMARY_BUSINESS_PATTERNS = [
  /\b(?:company|organisation|organization|business|bedrijf|onderneming|firma|studio|winkel|restaurant|praktijk|bv\.?|b\.v\.|holding|groep|group|agency)\s+(?:genaamd\s+|called\s+|named\s+|heet\s+|heette\s+)?([A-Z][\p{L}'`\-0-9 &]{1,120})/giu,
  /\b(?:van|from)\s+([A-Z][\p{L}'`\-0-9 &]{1,120})\s+(?:bedrijf|company|organisation|organization)\b/giu
];

function containsBusinessKeyword(value: string): boolean {
  const lower = value.toLowerCase();
  return BUSINESS_KEYWORDS.some((keyword) => lower.includes(keyword));
}

interface ElevenLabsAgentOutput {
  consent: boolean;
  name: string | null;
  organisation?: boolean;
}

function convertToBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lower = value.toLowerCase().trim();
    if (lower === "true") return true;
    if (lower === "false") return false;
  }
  return null;
}

function extractAgentOutput(
  conversation: PlainObject,
  payload: PlainObject,
  metadata: PlainObject,
  analysis: PlainObject
): ElevenLabsAgentOutput | null {
  // Helper function to validate and extract data from a candidate object
  const extractFromCandidate = (data: PlainObject, source: string): ElevenLabsAgentOutput | null => {
    // Reference source in dev to avoid unused var linter error and aid debugging
    if (IS_DEV) {
      // eslint-disable-next-line no-console
      console.log("🔎 extractFromCandidate source:", source);
    }
    const consentRaw = data.consent;
    const name = data.name;
    const organisationRaw = data.organisation;

    const consent = convertToBoolean(consentRaw);
    
    // Only proceed if consent is a valid boolean (true or false)
    if (consent === null) {
      return null;
    }

    // Name must be string or null
    if (typeof name !== "string" && name !== null) {
      return null;
    }

    // Convert organisation (can be undefined if not set)
    let organisation: boolean | undefined = undefined;
    if (organisationRaw !== undefined && organisationRaw !== null) {
      const orgConverted = convertToBoolean(organisationRaw);
      if (orgConverted !== null) {
        organisation = orgConverted;
      }
    }

    return {
      consent,
      name: typeof name === "string" ? cleanCallerName(name) ?? null : null,
      organisation
    };
  };

  // Check for ElevenLabs data_collection_results structure
  // Structure: analysis.data_collection_results.name.value, analysis.data_collection_results.consent.value, etc.
  const dataCollectionResults = toPlainObject(analysis.data_collection_results);
  if (dataCollectionResults && Object.keys(dataCollectionResults).length > 0) {
    const nameItem = toPlainObject(dataCollectionResults.name);
    const consentItem = toPlainObject(dataCollectionResults.consent);
    const organisationItem = toPlainObject(dataCollectionResults.organisation);

    const nameValue = typeof nameItem.value === "string" ? nameItem.value : nameItem.value === null ? null : undefined;
    const consentValue = consentItem.value;
    const organisationValue = organisationItem.value;

    if (nameValue !== undefined && consentValue !== undefined) {
      const consent = convertToBoolean(consentValue);
      
      if (consent !== null) {
        let organisation: boolean | undefined = undefined;
        if (organisationValue !== undefined && organisationValue !== null) {
          const orgConverted = convertToBoolean(organisationValue);
          if (orgConverted !== null) {
            organisation = orgConverted;
          }
        }

        const result = {
          consent,
          name: typeof nameValue === "string" ? cleanCallerName(nameValue) ?? null : null,
          organisation
        };

        if (IS_DEV) {
          console.log("✅ ElevenLabs data collection results found:", {
            raw: {
              consent: consentValue,
              name: nameValue,
              organisation: organisationValue
            },
            cleaned: result
          });
        }

        return result;
      }
    }
  }

  // Check data collection items directly in analysis object (common for ElevenLabs data collection)
  if (analysis.consent !== undefined || analysis.name !== undefined) {
    const directResult = extractFromCandidate(analysis, "analysis (direct)");
    if (directResult) {
      if (IS_DEV) {
        console.log("✅ ElevenLabs data collection output found directly in analysis:", {
          raw: {
            consent: analysis.consent,
            name: analysis.name,
            organisation: analysis.organisation
          },
          cleaned: directResult
        });
      }
      return directResult;
    }
  }

  // Also check for data_collection_results in other locations
  const checkDataCollectionResults = (obj: PlainObject, source: string): ElevenLabsAgentOutput | null => {
    const results = toPlainObject(obj.data_collection_results);
    if (results && Object.keys(results).length > 0) {
      const nameItem = toPlainObject(results.name);
      const consentItem = toPlainObject(results.consent);
      const organisationItem = toPlainObject(results.organisation);

      const nameValue = typeof nameItem.value === "string" ? nameItem.value : nameItem.value === null ? null : undefined;
      const consentValue = consentItem.value;
      const organisationValue = organisationItem.value;

      if (nameValue !== undefined && consentValue !== undefined) {
        const consent = convertToBoolean(consentValue);
        
        if (consent !== null) {
          let organisation: boolean | undefined = undefined;
          if (organisationValue !== undefined && organisationValue !== null) {
            const orgConverted = convertToBoolean(organisationValue);
            if (orgConverted !== null) {
              organisation = orgConverted;
            }
          }

          const result = {
            consent,
            name: typeof nameValue === "string" ? cleanCallerName(nameValue) ?? null : null,
            organisation
          };

          if (IS_DEV) {
            console.log(`✅ ElevenLabs data collection results found in ${source}:`, {
              raw: {
                consent: consentValue,
                name: nameValue,
                organisation: organisationValue
              },
              cleaned: result
            });
          }

          return result;
        }
      }
    }
    return null;
  };

  // Check data_collection_results in conversation and payload
  const conversationResults = checkDataCollectionResults(conversation, "conversation");
  if (conversationResults) return conversationResults;

  const payloadResults = checkDataCollectionResults(payload, "payload");
  if (payloadResults) return payloadResults;

  // Also check payload.data directly (common location for ElevenLabs webhooks)
  const payloadData = toPlainObject(payload.data);
  if (payloadData && Object.keys(payloadData).length > 0) {
    const payloadDataResults = checkDataCollectionResults(payloadData, "payload.data");
    if (payloadDataResults) return payloadDataResults;
  }

  // Check nested objects
  const candidates: Array<{ source: string; data: PlainObject }> = [
    { source: "conversation.output", data: conversation.output },
    { source: "conversation.result", data: conversation.result },
    { source: "conversation.call_result", data: conversation.call_result },
    { source: "conversation.call_output", data: conversation.call_output },
    { source: "conversation.agent_output", data: conversation.agent_output },
    { source: "conversation.agent_result", data: conversation.agent_result },
    { source: "payload.output", data: payload.output },
    { source: "payload.result", data: payload.result },
    { source: "payload.call_result", data: payload.call_result },
    { source: "payload.call_output", data: payload.call_output },
    { source: "payload.agent_output", data: payload.agent_output },
    { source: "payload.agent_result", data: payload.agent_result },
    { source: "metadata.output", data: metadata.output },
    { source: "metadata.result", data: metadata.result },
    { source: "metadata.agent_output", data: metadata.agent_output },
    { source: "metadata.agent_result", data: metadata.agent_result },
    { source: "analysis.output", data: analysis.output },
    { source: "analysis.result", data: analysis.result },
    { source: "analysis.agent_output", data: analysis.agent_output },
    { source: "analysis.agent_result", data: analysis.agent_result },
    // Also check for data collection specific fields
    { source: "analysis.data_collection", data: analysis.data_collection },
    { source: "conversation.data_collection", data: conversation.data_collection }
  ].filter((item): item is { source: string; data: PlainObject } => 
    typeof item.data === "object" && item.data !== null
  );

  if (IS_DEV && candidates.length > 0) {
    console.log("🔍 ElevenLabs agent output candidates found:", 
      candidates.map(c => ({ source: c.source, keys: Object.keys(c.data) }))
    );
  }

  for (const candidate of candidates) {
    const result = extractFromCandidate(candidate.data, candidate.source);
    
    if (result) {
      if (IS_DEV) {
        console.log("✅ ElevenLabs agent output found in expected format:", {
          source: candidate.source,
          raw: {
            consent: candidate.data.consent,
            name: candidate.data.name,
            organisation: candidate.data.organisation
          },
          cleaned: result
        });
      }
      return result;
    } else if (IS_DEV && (candidate.data.consent !== undefined || candidate.data.name !== undefined)) {
      console.log("⚠️ Candidate found but format invalid:", {
        source: candidate.source,
        consent: typeof candidate.data.consent,
        consentValue: candidate.data.consent,
        name: typeof candidate.data.name,
        organisation: typeof candidate.data.organisation,
        organisationValue: candidate.data.organisation,
        data: candidate.data
      });
    }
  }

  if (IS_DEV) {
    console.log("❌ ElevenLabs agent output not found in expected format");
    console.log("📦 Full payload structure:", {
      conversation: {
        hasOutput: !!conversation.output,
        hasResult: !!conversation.result,
        hasCallResult: !!conversation.call_result,
        hasCallOutput: !!conversation.call_output,
        hasAgentOutput: !!conversation.agent_output,
        hasAgentResult: !!conversation.agent_result,
        hasDataCollection: !!conversation.data_collection,
        keys: Object.keys(conversation).slice(0, 20)
      },
      payload: {
        hasOutput: !!payload.output,
        hasResult: !!payload.result,
        hasCallResult: !!payload.call_result,
        hasCallOutput: !!payload.call_output,
        hasAgentOutput: !!payload.agent_output,
        hasAgentResult: !!payload.agent_result,
        keys: Object.keys(payload).slice(0, 20)
      },
      metadata: {
        hasOutput: !!metadata.output,
        hasResult: !!metadata.result,
        hasAgentOutput: !!metadata.agent_output,
        hasAgentResult: !!metadata.agent_result,
        keys: Object.keys(metadata).slice(0, 20)
      },
      analysis: {
        hasOutput: !!analysis.output,
        hasResult: !!analysis.result,
        hasAgentOutput: !!analysis.agent_output,
        hasAgentResult: !!analysis.agent_result,
        hasDataCollection: !!analysis.data_collection,
        hasDataCollectionResults: !!analysis.data_collection_results,
        consent: analysis.consent,
        name: analysis.name,
        organisation: analysis.organisation,
        dataCollectionResultsKeys: analysis.data_collection_results ? Object.keys(toPlainObject(analysis.data_collection_results)) : [],
        keys: Object.keys(analysis).slice(0, 30)
      }
    });
  }

  return null;
}

function verifyHmacSignature(rawBody: string, signatureHeader: string | null) {
  if (!WEBHOOK_SECRET) {
    return true;
  }

  if (!signatureHeader) {
    if (IS_DEV) {
      console.error("ElevenLabs webhook missing signature header");
    }
    return false;
  }

  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split("=");
    if (key && value) {
      acc[key.trim()] = value.trim();
    }
    return acc;
  }, {});

  const timestamp = parts.t;
  const providedSignature = parts.v0 ?? parts.v1 ?? parts.v2;

  if (!timestamp || !providedSignature) {
    if (IS_DEV) {
      console.error("ElevenLabs webhook signature header missing timestamp or signature", {
        signatureHeader
      });
    }
    return false;
  }

  const payloadToSign = `${timestamp}.${rawBody ?? ""}`;
  const hmac = crypto.createHmac("sha256", WEBHOOK_SECRET);
  hmac.update(payloadToSign, "utf8");
  const expectedHex = hmac.digest("hex");
  const expectedBase64 = Buffer.from(expectedHex, "hex").toString("base64");

  const candidates = [providedSignature, providedSignature.replace(/^sha256=/i, "")];

  const verified = candidates.some((candidate) => {
    const cleaned = candidate.replace(/^sha256=/i, "");
    return (
      cleaned.toLowerCase() === expectedHex ||
      cleaned === expectedBase64 ||
      candidate.toLowerCase() === expectedHex ||
      candidate === expectedBase64
    );
  });

  if (!verified && IS_DEV) {
    console.error("ElevenLabs webhook signature mismatch", {
      provided: signatureHeader,
      timestamp,
      expectedHex,
      expectedBase64
    });
  }

  return verified;
}

function determineLookupStatus(event?: string, conversationStatus?: string): LookupStatus | undefined {
  const status = conversationStatus?.toLowerCase();
  const evt = event?.toLowerCase();

  if (status && ["completed", "succeeded", "success", "finished", "done"].includes(status)) {
    return "cached";
  }

  if (evt && (evt.includes("completed") || evt.includes("post_call_transcription"))) {
    return "cached";
  }

  if (status && ["failed", "error", "cancelled", "canceled"].includes(status)) {
    return "failed";
  }

  if (evt && (evt.includes("failed") || evt.includes("error"))) {
    return "failed";
  }

  return undefined;
}

function determineCallOutcome(summary?: string | null): ProfileCallOutcome {
  if (summary && summary.length > 0) {
    return "confirmed";
  }

  return "pending";
}

type PlainObject = Record<string, unknown>;

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 1) {
      return trimmed;
    }
  }
  return null;
}

function toPlainObject(value: unknown): PlainObject {
  if (typeof value === "object" && value !== null) {
    return value as PlainObject;
  }

  return {};
}

function extractTranscript(raw: unknown): string | null {
  const conversation = toPlainObject(raw);

  if (typeof conversation.transcript === "string") {
    return conversation.transcript;
  }

  const messages = Array.isArray(conversation.messages)
    ? (conversation.messages as unknown[])
    : null;

  if (messages) {
    const parts = messages
      .map((entry) => {
        const message = toPlainObject(entry);
        const content =
          typeof message.content === "string"
            ? message.content
            : typeof message.text === "string"
            ? message.text
            : typeof message.message === "string"
            ? message.message
            : null;

        if (!content) return null;

        const speaker =
          typeof message.role === "string"
            ? message.role
            : typeof message.speaker === "string"
            ? message.speaker
            : null;

        return speaker ? `${speaker}: ${content}` : content;
      })
      .filter((entry): entry is string => Boolean(entry));

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  return null;
}

interface TranscriptMessage {
  role?: string;
  message: string;
  timestamp?: number;
}

function toTranscriptMessages(entries: unknown[]): TranscriptMessage[] {
  const result: TranscriptMessage[] = [];

  for (const entry of entries) {
    const object = toPlainObject(entry);
    const message =
      typeof object.message === "string"
        ? object.message
        : typeof object.text === "string"
        ? object.text
        : typeof object.content === "string"
        ? object.content
        : null;

    if (!message) {
      continue;
    }

    const role =
      typeof object.role === "string"
        ? object.role
        : typeof object.speaker === "string"
        ? object.speaker
        : typeof object.participant === "string"
        ? object.participant
        : undefined;

    const timestampRaw =
      typeof object.timestamp === "number"
        ? object.timestamp
        : typeof object.start === "number"
        ? object.start
        : typeof object.offset === "number"
        ? object.offset
        : typeof object.time === "number"
        ? object.time
        : undefined;

    result.push({
      role,
      message: String(message),
      timestamp: timestampRaw
    });
  }

  return result;
}

function cleanCallerName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").replace(/^[\W_]+|[\W_]+$/g, "").trim();
  if (normalized.length < 2) {
    return null;
  }
  return normalized;
}

function addCandidateToSet(
  collection: Set<string>,
  value: unknown,
  { allowDigits = true }: { allowDigits?: boolean } = {}
) {
  const cleaned = cleanCallerName(value);
  if (!cleaned) return;
  if (!allowDigits && /\d/.test(cleaned)) return;
  const lower = cleaned.toLowerCase();
  if (GENERIC_CALLER_LABELS.has(lower)) return;
  collection.add(cleaned);
}

function addTextMatchesToSet(
  text: string | null | undefined,
  patterns: RegExp[],
  collection: Set<string>,
  options?: { allowDigits?: boolean }
) {
  if (!text) return;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const candidate = match[1];
      if (!candidate) continue;
      addCandidateToSet(collection, candidate, options);
    }
  }
}

function collectPersonNamesFromTranscript(messages: TranscriptMessage[]): string[] {
  const candidates = new Set<string>();

  for (const entry of messages) {
    const role = entry.role?.toLowerCase();
    if (role && !ALLOWED_CALLER_ROLES.has(role)) {
      continue;
    }

    const cleanedLine = entry.message.replace(/[.!?]+$/u, "").trim();
    if (!cleanedLine) continue;

    addTextMatchesToSet(cleanedLine, TRANSCRIPT_NAME_PATTERNS, candidates, { allowDigits: false });
  }

  return Array.from(candidates);
}

function extractNameFromEntities(analysis?: PlainObject): string | null {
  if (!analysis) return null;
  const entitiesRaw = analysis.entities;
  
  if (!entitiesRaw) {
    return null;
  }

  let entitiesArray: unknown[] = [];
  
  if (Array.isArray(entitiesRaw)) {
    entitiesArray = entitiesRaw;
  } else if (typeof entitiesRaw === "object" && entitiesRaw !== null) {
    const entitiesObj = toPlainObject(entitiesRaw);
    if (entitiesObj && typeof entitiesObj === "object") {
      entitiesArray = Object.values(entitiesObj);
    }
  } else {
    return null;
  }

  for (const item of entitiesArray) {
    const entity = toPlainObject(item);
    const type = typeof entity.type === "string" ? entity.type.toLowerCase() : "";
    const value = cleanCallerName(
      typeof entity.value === "string"
        ? entity.value
        : typeof entity.name === "string"
        ? entity.name
        : typeof entity.text === "string"
        ? entity.text
        : null
    );

    if (!value) continue;

    if (PERSON_ENTITY_TYPES.has(type) || (!type && value)) {
      return value;
    }

    if (BUSINESS_ENTITY_TYPES.has(type) && value) {
      return value;
    }
  }

  return null;
}

function deriveCallerNameFromTranscript(
  transcript: TranscriptMessage[],
  analysis?: PlainObject
): string | null {
  const entityCandidate = extractNameFromEntities(analysis);
  if (entityCandidate) {
    return entityCandidate;
  }

  const transcriptCandidates = collectPersonNamesFromTranscript(transcript);
  return transcriptCandidates[0] ?? null;
}

function deriveEntityTag({
  summary,
  callerName,
  metadata,
  analysis
}: {
  summary?: string | null;
  callerName?: string | null;
  metadata?: PlainObject;
  analysis?: PlainObject;
}): string | null {
  const metadataTag = (() => {
    if (!metadata) return null;
    const directTag =
      typeof metadata.entityTag === "string"
        ? metadata.entityTag
        : typeof metadata.entity_tag === "string"
        ? metadata.entity_tag
        : typeof metadata.tag === "string"
        ? metadata.tag
        : null;
    if (directTag) {
      return directTag;
    }

    const entityType =
      typeof metadata.entityType === "string"
        ? metadata.entityType
        : typeof metadata.entity_type === "string"
        ? metadata.entity_type
        : typeof metadata.callerType === "string"
        ? metadata.callerType
        : typeof metadata.caller_type === "string"
        ? metadata.caller_type
        : null;

    if (!entityType) return null;

    const normalized = entityType.toLowerCase();
    if (
      ["business", "company", "enterprise", "organisation", "organization", "corporate"].some((token) =>
        normalized.includes(token)
      )
    ) {
      return "Bedrijf";
    }

    if (["person", "individual", "human"].some((token) => normalized.includes(token))) {
      return "Particulier";
    }

    return null;
  })();

  if (metadataTag) {
    const normalized = metadataTag.trim().toLowerCase();
    if (["business", "company", "organisation", "organization", "corporate"].includes(normalized)) {
      return "Bedrijf";
    }
    if (["person", "individual", "human", "persoon", "particulier"].includes(normalized)) {
      return "Particulier";
    }
    return metadataTag;
  }

  if (analysis) {
    const entitiesRaw = analysis.entities;
    
    if (entitiesRaw) {
      let entitiesArray: unknown[] = [];
      
      if (Array.isArray(entitiesRaw)) {
        entitiesArray = entitiesRaw;
      } else if (typeof entitiesRaw === "object" && entitiesRaw !== null) {
        const entitiesObj = toPlainObject(entitiesRaw);
        if (entitiesObj && typeof entitiesObj === "object") {
          entitiesArray = Object.values(entitiesObj);
        }
      }
      
      for (const item of entitiesArray) {
        const entity = toPlainObject(item);
        const type = typeof entity.type === "string" ? entity.type.toLowerCase() : "";

        if (BUSINESS_ENTITY_TYPES.has(type)) {
          return "Bedrijf";
        }

        if (PERSON_ENTITY_TYPES.has(type)) {
          return "Particulier";
        }
      }
    }

    const classification = toPlainObject(analysis.classification);
    const category =
      typeof classification.category === "string"
        ? classification.category.toLowerCase()
        : typeof classification.type === "string"
        ? classification.type.toLowerCase()
        : null;
    if (category) {
      if (["business", "company", "organisation", "organization"].includes(category)) {
        return "Bedrijf";
      }
      if (["person", "individual", "human"].includes(category)) {
        return "Particulier";
      }
    }
  }

  const textParts: string[] = [];
  if (summary) textParts.push(summary);
  if (callerName) textParts.push(callerName);
  if (metadata) {
    const businessName =
      typeof metadata.businessName === "string"
        ? metadata.businessName
        : typeof metadata.companyName === "string"
        ? metadata.companyName
        : null;
    if (businessName) {
      textParts.push(businessName);
    }
  }

  const combined = textParts.join(" ").toLowerCase();
  if (combined) {
    if (BUSINESS_KEYWORDS.some((keyword) => combined.includes(keyword))) {
      return "Bedrijf";
    }
  }

  if (callerName && callerName !== "Onbekende beller") {
    return "Particulier";
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signatureHeader =
      request.headers.get("elevenlabs-signature") ?? request.headers.get("Elevenlabs-Signature");

    // Log all headers for debugging webhook type detection
    if (IS_DEV) {
      const allHeaders: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        allHeaders[key] = value;
      });
      console.log("📋 Webhook headers:", allHeaders);
    }

    if (!verifyHmacSignature(rawBody, signatureHeader)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: PlainObject;
    try {
      payload = toPlainObject(rawBody ? JSON.parse(rawBody) : {});
    } catch (error) {
      if (IS_DEV) {
        console.error("ElevenLabs webhook invalid JSON", {
          rawBody,
          error
        });
      }
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

  const dataPayload = toPlainObject(payload.data);
  const conversation = toPlainObject(payload.conversation ?? dataPayload ?? payload);
  const metadata = toPlainObject(conversation.metadata ?? payload.metadata);
  const initiationClientData = toPlainObject(
    conversation.conversation_initiation_client_data ?? dataPayload.conversation_initiation_client_data
  );
  const dynamicVariables = toPlainObject(initiationClientData.dynamic_variables);
  
  // Extract event type early for webhook type detection
  const event = (() => {
    const value = payload.event ?? payload.type;
    return typeof value === "string" ? value : undefined;
  })();
  
  // Extract more details for debugging (always log in production for troubleshooting)
  const eventType = event;
  
  // Determine webhook type based on event and payload structure
  const webhookType = (() => {
    if (eventType?.toLowerCase().includes("initiation") || eventType?.toLowerCase().includes("initiate")) {
      return "initiation";
    }
    if (eventType?.toLowerCase().includes("post_call") || eventType?.toLowerCase().includes("transcription")) {
      return "post_call";
    }
    return "conversation";
  })();
  
  console.log("📥 ElevenLabs webhook received:", {
    webhookType,
    event: eventType,
    conversationStatus: conversation.status ?? payload.status ?? dataPayload.status,
    hasConversation: !!payload.conversation,
    hasData: !!payload.data,
    conversationKeys: payload.conversation ? Object.keys(payload.conversation).slice(0, 10) : [],
    dataKeys: payload.data ? Object.keys(payload.data).slice(0, 10) : [],
    // Log important fields from data payload
    dataStatus: dataPayload.status,
    dataConversationId: dataPayload.conversation_id,
    dataAgentId: dataPayload.agent_id,
    hasTranscript: !!dataPayload.transcript,
    transcriptLength: Array.isArray(dataPayload.transcript) ? dataPayload.transcript.length : 0,
    // Log first part of payload for debugging (in dev only)
    payloadPreview: IS_DEV ? JSON.stringify(payload, null, 2).slice(0, 1000) : undefined
  });
  
  const conversationId =
    (typeof conversation.id === "string"
      ? conversation.id
      : typeof conversation.conversation_id === "string"
      ? conversation.conversation_id
      : typeof payload.conversation_id === "string"
      ? payload.conversation_id
      : typeof payload.conversationId === "string"
      ? payload.conversationId
      : typeof dataPayload.conversation_id === "string"
      ? (dataPayload.conversation_id as string)
      : null);

  if (!conversationId) {
    if (IS_DEV) {
      console.error("ElevenLabs webhook missing conversation id", {
        metadata,
        conversation,
        payload
      });
    }
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  // Try to extract lookupId from multiple locations, including ElevenLabs dynamic variables
  const lookupId: string | undefined = (() => {
    const direct = metadata.lookupId ?? metadata.lookup_id ?? payload.lookupId ?? payload.lookup_id;
    if (typeof direct === "string") return direct;

    const dynLookupId = dynamicVariables.lookupId ?? dynamicVariables.lookup_id;
    if (typeof dynLookupId === "string") return dynLookupId;

    return undefined;
  })();

  const conversationCustomer = toPlainObject(conversation.customer);
  const metadataContact = toPlainObject(metadata.contact);
  const payloadContact = toPlainObject(dataPayload.contact);

  const normalizedCandidates: Array<string | null> = [
    typeof metadata.normalized === "string" ? metadata.normalized : null,
    typeof dynamicVariables.normalized === "string" ? dynamicVariables.normalized : null,
    typeof dynamicVariables.normalized_number === "string" ? dynamicVariables.normalized_number : null,
    typeof dynamicVariables.target_number === "string" ? dynamicVariables.target_number : null,
    typeof dynamicVariables.targetNumber === "string" ? dynamicVariables.targetNumber : null,
    typeof dynamicVariables.rawInput === "string" ? dynamicVariables.rawInput : null,
    typeof dataPayload.normalized === "string" ? dataPayload.normalized : null,
    typeof dataPayload.phone_number === "string" ? dataPayload.phone_number : null,
    typeof conversation.phone_number === "string" ? conversation.phone_number : null,
    typeof conversationCustomer.number === "string" ? conversationCustomer.number : null,
    typeof conversationCustomer.phone_number === "string" ? conversationCustomer.phone_number : null,
    typeof payload.phone_number === "string" ? payload.phone_number : null,
    typeof metadataContact.number === "string" ? metadataContact.number : null,
    typeof metadataContact.phone_number === "string" ? metadataContact.phone_number : null,
    typeof metadataContact.phoneNumber === "string" ? metadataContact.phoneNumber : null,
    typeof payloadContact.number === "string" ? payloadContact.number : null,
    typeof payloadContact.phone_number === "string" ? payloadContact.phone_number : null,
    typeof payloadContact.phoneNumber === "string" ? payloadContact.phoneNumber : null
  ];

  let normalizedNumberPre: string | null = null;
  for (const candidate of normalizedCandidates) {
    if (!candidate) continue;
    try {
      normalizedNumberPre = parsePhoneNumber(candidate);
      break;
    } catch {
      continue;
    }
  }

  let resolvedLookupId: string | null = lookupId ?? null;
  let lookupRecord: { id: string; normalized: string; profile_id: string | null } | null = null;
  if (resolvedLookupId) {
    const fetchedLookup = await getLookupById(resolvedLookupId);
    if (fetchedLookup) {
      lookupRecord = fetchedLookup;
    } else {
      if (IS_DEV) {
        console.warn("⚠️ Lookup id from webhook not found in database:", {
          lookupId: resolvedLookupId,
          normalizedNumberPre
        });
      }
      resolvedLookupId = null;
    }
  }

  // Note: event is already extracted above
  
  const conversationStatus = (() => {
    const value = conversation.status ?? payload.status;
    return typeof value === "string" ? value : undefined;
  })();

  // Also check data.payload.status for status information
  const dataPayloadStatus = typeof dataPayload.status === "string" ? dataPayload.status : undefined;

  // Use conversationStatus or fallback to dataPayloadStatus
  const effectiveStatus = conversationStatus ?? dataPayloadStatus;

  const analysis = toPlainObject(conversation.analysis ?? dataPayload.analysis);

  const transcriptSource = (() => {
    if (Array.isArray(dataPayload.transcript)) return dataPayload.transcript;
    if (Array.isArray(conversation.transcript)) return conversation.transcript;
    return null;
  })();

  const transcriptMessages = toTranscriptMessages(transcriptSource ?? []);
  const transcript = extractTranscript(conversation) ?? transcriptMessages.map((entry) => entry.message).join("\n");

  const summaryCandidates = [
    typeof analysis.transcript_summary === "string" ? analysis.transcript_summary : null,
    typeof conversation.summary === "string" ? conversation.summary : null,
    typeof payload.summary === "string" ? payload.summary : null,
    typeof metadata.summary === "string" ? metadata.summary : null
  ];
  const summary = summaryCandidates.find((text) => text && text.trim().length > 0) ?? null;

  const confidenceCandidate =
    conversation.confidence ?? analysis.confidence ?? payload.confidence ?? metadata.confidence;
  const confidence = typeof confidenceCandidate === "number" ? confidenceCandidate : null;

  const endedAt =
    (typeof conversation.completed_at === "string"
      ? conversation.completed_at
      : typeof conversation.ended_at === "string"
      ? conversation.ended_at
      : typeof payload.completed_at === "string"
      ? payload.completed_at
      : typeof payload.ended_at === "string"
      ? payload.ended_at
      : null);

  // Check if we have any completed data yet
  const hasCompletedData = !!(transcript || summary);

  const lookupStatus = determineLookupStatus(event, effectiveStatus);
  
  // Log lookup status determination for debugging
  console.log("🔍 Lookup status determination:", {
    event,
    effectiveStatus,
    lookupStatus,
    hasCompletedData,
    hasTranscript: !!transcript,
    hasSummary: !!summary
  });

  // Check if this is an initiation event (call starting)
  // This could be based on event type OR status indicating call is starting
  // Check for various initiation event formats (including WebSocket-style events that might be sent via webhooks)
  const eventLower = event?.toLowerCase() ?? "";
  const isInitiationEvent =
    eventLower.includes("initiation") ||
    eventLower.includes("initiate") ||
    eventLower.includes("conversation_initiated") ||
    eventLower.includes("conversation_initiation") ||
    eventLower.includes("call_started") ||
    eventLower === "conversation_initiation_metadata" ||
    eventLower === "conversation_initiation_client_data";

  // Also check status for initiation indicators
  const isInitiationStatus =
    effectiveStatus?.toLowerCase().includes("connecting") ||
    effectiveStatus?.toLowerCase().includes("ringing") ||
    effectiveStatus?.toLowerCase().includes("dialing") ||
    effectiveStatus?.toLowerCase().includes("initiating") ||
    effectiveStatus?.toLowerCase().includes("initiate");

  // Check if this is the first webhook for this conversation (no transcript/data yet)
  const hasNoDataYet = !hasCompletedData;

  // Check if call attempt exists and is still in "scheduled" state (indicating call just started)
  let existingCallAttempt = conversationId
    ? await getCallAttemptByConversationId(conversationId)
    : null;

  if (existingCallAttempt?.lookup_id && !resolvedLookupId) {
    resolvedLookupId = existingCallAttempt.lookup_id;
    if (!lookupRecord || lookupRecord.id !== existingCallAttempt.lookup_id) {
      const fetched = await getLookupById(existingCallAttempt.lookup_id);
      if (fetched) {
        lookupRecord = fetched;
      }
    }
  }

  if (!resolvedLookupId && normalizedNumberPre) {
    const latestLookup = await getLatestLookupByNormalized(normalizedNumberPre);
    if (latestLookup) {
      resolvedLookupId = latestLookup.id;
      lookupRecord = {
        id: latestLookup.id,
        normalized: latestLookup.normalized,
        profile_id: latestLookup.profile_id
      };
    }
  }

  const isStillScheduled = existingCallAttempt?.status === "scheduled";

  const enrichedPayload = {
    ...(typeof payload === "object" && payload !== null ? payload : {}),
    event: event ?? undefined,
    type: event ?? undefined
  };

  const statusLower = effectiveStatus?.toLowerCase() ?? "";
  const isPostCallEvent =
    eventLower.includes("post_call") ||
    eventLower.includes("post-call") ||
    eventLower.includes("completed") ||
    eventLower.includes("finished") ||
    statusLower.includes("completed") ||
    statusLower.includes("finished") ||
    statusLower.includes("done") ||
    statusLower.includes("succeeded") ||
    statusLower.includes("success");

  // If we have completed data (transcript/summary), this is definitely a post-call event
  // OR if we have explicit post-call indicators
  const shouldUpdateByLookupId = hasCompletedData || isPostCallEvent;

  const hasExplicitPostCallTranscription =
    eventLower.includes("post_call_transcription") || eventLower.includes("post-call-transcription");
  const hasExplicitCompletionEvent =
    eventLower.includes("completed") || eventLower.includes("finished");

  let statusToSet = event ?? effectiveStatus ?? "received";
  if (hasCompletedData || hasExplicitPostCallTranscription) {
    statusToSet = "post_call_transcription";
  } else if (hasExplicitCompletionEvent) {
    statusToSet = event ?? "completed";
  } else if (
    statusLower.includes("completed") ||
    statusLower.includes("finished") ||
    statusLower.includes("succeeded") ||
    statusLower.includes("success") ||
    statusLower.includes("done")
  ) {
    statusToSet = effectiveStatus ?? "completed";
  }

  let elevenLabsStatusToSet: string | null = effectiveStatus ?? null;
  if (hasCompletedData || isPostCallEvent || hasExplicitPostCallTranscription) {
    elevenLabsStatusToSet = effectiveStatus ?? event ?? "post_call_transcription";
  }

  // First, try to update/get the call attempt to find lookupId
  // We need lookupId to properly handle initiation events
  let lookupIdFromCall: string | null = null;
  if (conversationId) {
    lookupIdFromCall = await updateCallAttemptByConversation({
      conversationId,
      status: statusToSet,
      elevenLabsStatus: elevenLabsStatusToSet,
      payload: enrichedPayload,
      transcript,
      summary,
      confidence,
      endedAt
    });

    if (!lookupIdFromCall && resolvedLookupId) {
      const updatedByLookup = await updateCallAttemptByLookupId({
        lookupId: resolvedLookupId,
        status: statusToSet,
        elevenLabsStatus: elevenLabsStatusToSet,
        payload: enrichedPayload,
        transcript,
        summary,
        confidence,
        endedAt
      });

      if (updatedByLookup) {
        lookupIdFromCall = resolvedLookupId;
        existingCallAttempt = updatedByLookup;
      }
    }

    if (lookupIdFromCall) {
      existingCallAttempt = await getCallAttemptByConversationId(conversationId);
    }
  }

  if (lookupIdFromCall && lookupIdFromCall !== resolvedLookupId) {
    resolvedLookupId = lookupIdFromCall;
    if (!lookupRecord || lookupRecord.id !== lookupIdFromCall) {
      const fetched = await getLookupById(lookupIdFromCall);
      if (fetched) {
        lookupRecord = fetched;
      }
    }
  }


  // Handle initiation events - update status to show call is starting
  // This includes:
  // 1. Explicit initiation events
  // 2. Status indicating call is starting (connecting, ringing, etc.)
  // 3. Call attempt is still "scheduled" (first webhook after scheduling)
  // 4. First webhook for a conversation with no data yet
  // IMPORTANT: Skip initiation update if we have completed data (post-call event) to avoid overwriting complete data
  if ((isInitiationEvent || isInitiationStatus || isStillScheduled || (hasNoDataYet && !hasCompletedData)) && conversationId && !hasCompletedData && !isPostCallEvent) {
    const statusToSet = event ?? effectiveStatus ?? (isStillScheduled ? "initiating" : "connecting");
    const elevenLabsStatus = effectiveStatus ?? null;

    // Get lookupId from call attempt if we don't have it from metadata
    const currentLookupId = resolvedLookupId ?? lookupIdFromCall ?? null;

    if (currentLookupId) {
      // Update existing call attempt with initiation status
      await updateCallAttemptByConversation({
        conversationId,
        status: statusToSet,
        elevenLabsStatus,
        payload
      });

      console.log("📞 Initiation event detected:", {
        event,
        conversationStatus: effectiveStatus,
        conversationId,
        status: statusToSet,
        lookupId: currentLookupId,
        reason: isInitiationEvent ? "explicit_event" : isInitiationStatus ? "status_indicator" : isStillScheduled ? "was_scheduled" : "first_webhook"
      });
    } else if (lookupIdFromCall) {
      // Update with initiation status
      await updateCallAttemptByConversation({
        conversationId,
        status: statusToSet,
        elevenLabsStatus,
        payload
      });

      console.log("📞 Initiation event detected (found lookupId):", {
        event,
        conversationStatus: effectiveStatus,
        conversationId,
        status: statusToSet,
        lookupIdFromCall
      });
    }
  }

  let effectiveLookupId = resolvedLookupId ?? lookupIdFromCall ?? null;

  if (!effectiveLookupId && normalizedNumberPre) {
    const latestLookup = await getLatestLookupByNormalized(normalizedNumberPre);
    if (latestLookup) {
      effectiveLookupId = latestLookup.id;
      if (!lookupRecord || lookupRecord.id !== latestLookup.id) {
        lookupRecord = {
          id: latestLookup.id,
          normalized: latestLookup.normalized,
          profile_id: latestLookup.profile_id
        };
      }
    }
  }

  if (!effectiveLookupId) {
    return NextResponse.json({ success: true, note: "Lookup id missing" });
  }

  // For post-call events with data, ALWAYS update by lookupId (same as test simulation)
  // This ensures consistent data structure and triggers frontend updates correctly
  if (shouldUpdateByLookupId && effectiveLookupId) {
    const payloadForLookupUpdate = {
      ...enrichedPayload,
      event: event ?? (hasCompletedData ? "post_call_transcription" : enrichedPayload.event),
      type: event ?? (hasCompletedData ? "post_call_transcription" : enrichedPayload.type)
    };
    
    // Determine the status to set based on event type and available data
    const lookupStatusToSet = statusToSet;
    
    console.log("🔄 Updating call attempt by lookupId:", {
      lookupId: effectiveLookupId,
      event,
      effectiveStatus,
      hasCompletedData,
      isPostCallEvent,
      status: lookupStatusToSet,
      elevenLabsStatus: elevenLabsStatusToSet,
      hasTranscript: !!transcript,
      hasSummary: !!summary,
      transcriptLength: transcript?.length ?? 0,
      summaryLength: summary?.length ?? 0
    });
    
    const updateResult = await updateCallAttemptByLookupId({
      lookupId: effectiveLookupId,
      status: lookupStatusToSet,
      elevenLabsStatus: elevenLabsStatusToSet,
      payload: payloadForLookupUpdate,
      transcript,
      summary,
      confidence,
      endedAt
    });
    
    console.log("✅ Call attempt updated by lookupId:", {
      lookupId: effectiveLookupId,
      updateResult: updateResult ? "success" : "failed",
      status: lookupStatusToSet,
      hasTranscript: !!transcript,
      hasSummary: !!summary
    });
    
    // DEV SAFETY NET: if the active lookup in the UI is a different one for the same number,
    // also mirror the update to the most recent lookup for that normalized number.
    // This happens when DEV_DEBUG=false and the UI created a new scheduled lookup
    // without a conversation id, while the webhook refers to an older conversation.
    const normalizedForMirror = normalizedNumberPre;
    if (normalizedForMirror) {
      const latestLookup = await getLatestLookupByNormalized(normalizedForMirror);
      if (latestLookup && latestLookup.id !== effectiveLookupId) {
        console.log("🪞 Mirroring update to latest lookup for normalized:", {
          normalizedNumber: normalizedForMirror,
          sourceLookupId: effectiveLookupId,
          latestLookupId: latestLookup.id,
          latestStatus: latestLookup.status
        });
        await updateCallAttemptByLookupId({
          lookupId: latestLookup.id,
          status: lookupStatusToSet,
          elevenLabsStatus: elevenLabsStatusToSet,
          payload: payloadForLookupUpdate,
          transcript,
          summary,
          confidence,
          endedAt
        });
      }
    }
  } else if (effectiveLookupId) {
    console.log("⏸️ Skipping lookupId update:", {
      lookupId: effectiveLookupId,
      event,
      effectiveStatus,
      hasCompletedData,
      isPostCallEvent,
      shouldUpdateByLookupId,
      hasTranscript: !!transcript,
      hasSummary: !!summary
    });
  }

  const lookup =
    lookupRecord && lookupRecord.id === effectiveLookupId
      ? lookupRecord
      : await getLookupById(effectiveLookupId);
  if (!lookup) {
    return NextResponse.json({ success: true, note: "Lookup not found" });
  }

  const normalizedSource =
    (typeof metadata.normalized === "string"
      ? metadata.normalized
      : lookup.normalized ??
        (typeof conversation.phone_number === "string"
          ? conversation.phone_number
          : typeof toPlainObject(conversation.customer).number === "string"
          ? (toPlainObject(conversation.customer).number as string)
          : typeof payload.phone_number === "string"
          ? payload.phone_number
          : null));

  let normalizedNumber: string | null = null;
  if (typeof normalizedSource === "string") {
    try {
      normalizedNumber = parsePhoneNumber(normalizedSource);
    } catch {
      normalizedNumber = null;
    }
  }

  let profileId = lookup.profile_id ?? null;

  if (IS_DEV) {
    console.log("🔍 Lookup status check:", {
      event,
      conversationStatus: effectiveStatus,
      lookupStatus,
      normalizedNumber,
      normalizedSource
    });
    console.log("🔍 Profile creation check:", {
      lookupStatus,
      normalizedNumber,
      willCreateProfile: lookupStatus === "cached" && normalizedNumber !== null
    });
  }

  if (lookupStatus === "cached" && normalizedNumber) {
    const contact = toPlainObject(conversation.contact);
    const existingProfileRecord: PhoneProfileRecord | null =
      (profileId ? await getProfileById(profileId) : await fetchProfileRecordByNumber(normalizedNumber)) ??
      null;

    if (!profileId && existingProfileRecord) {
      profileId = existingProfileRecord.id;
    }

    const agentOutput = extractAgentOutput(conversation, payload, metadata, analysis);

    let callerName: string | null = null;
    let entityTag: string | null = null;
    let personList: string[] = [];
    let businessList: string[] = [];
    let nameSource: "elevenlabs" | "fallback" | null = null;
    let entityTypeSource: "elevenlabs" | "fallback" | null = null;

    if (agentOutput && agentOutput.consent && agentOutput.name) {
      callerName = agentOutput.name;
      nameSource = "elevenlabs";
      if (agentOutput.organisation === true) {
        entityTag = "Bedrijf";
        entityTypeSource = "elevenlabs";
        businessList = [agentOutput.name];
      } else if (agentOutput.organisation === false) {
        entityTag = "Particulier";
        entityTypeSource = "elevenlabs";
        personList = [agentOutput.name];
      } else {
        entityTag = null;
        personList = [agentOutput.name];
      }
      
      if (IS_DEV) {
        console.log("✅ Using agent output:", { callerName, entityTag, agentOutput });
      }
    } else if (agentOutput && !agentOutput.consent) {
      callerName = "Onbekende beller";
      entityTag = null;
      
      if (IS_DEV) {
        console.log("🚫 Consent denied:", agentOutput);
      }
    } else if (IS_DEV) {
      console.log("⚠️ No valid agent output found, falling back to heuristics");
    }

    if (!callerName || !entityTag) {
      const derivedCallerNameFromTranscript = deriveCallerNameFromTranscript(transcriptMessages, analysis);

      const personCandidates = new Set<string>();
      const businessCandidates = new Set<string>();

      const addPersonCandidate = (value: unknown) => addCandidateToSet(personCandidates, value, { allowDigits: false });
      const addBusinessCandidate = (value: unknown) => addCandidateToSet(businessCandidates, value);

      const addValues = (
        source: PlainObject | null | undefined,
        keys: string[],
        handler: (value: unknown) => void
      ) => {
        if (!source) return;
        for (const key of keys) {
          const raw = source[key];
          if (raw !== undefined && raw !== null) {
            handler(raw);
          }
        }
      };

      addPersonCandidate(pickString(metadata.callerName, metadata.caller_name, metadata.name));
      addPersonCandidate(pickString(contact.name, conversation.caller_name));

      if (derivedCallerNameFromTranscript) {
        addPersonCandidate(derivedCallerNameFromTranscript);
      }

      for (const candidate of collectPersonNamesFromTranscript(transcriptMessages)) {
        addPersonCandidate(candidate);
      }

      const metadataContact = toPlainObject(metadata.contact);
      const metadataCompany = toPlainObject(metadata.company);
      const metadataBusinessInfo = toPlainObject(metadata.business);
      const conversationCustomer = toPlainObject(conversation.customer);
      const payloadData = toPlainObject(payload.data);
      const payloadContact = toPlainObject(payloadData.contact);
      const payloadCompany = toPlainObject(payloadData.company);

      addValues(metadata, [
        "callerName",
        "caller_name",
        "name",
        "personName",
        "person_name",
        "contactName",
        "contact_name",
        "full_name",
        "display_name"
      ], addPersonCandidate);
      addValues(metadataContact, ["name", "full_name", "contact_name", "display_name"], addPersonCandidate);
      addValues(contact, ["name", "full_name", "contact_name", "display_name"], addPersonCandidate);
      addValues(conversationCustomer, ["name", "full_name", "contact_name", "display_name"], addPersonCandidate);
      addValues(payloadData, ["callerName", "caller_name", "personName", "person_name"], addPersonCandidate);
      addValues(payloadContact, ["name", "full_name", "contact_name", "display_name"], addPersonCandidate);
      addValues(analysis, ["callerName", "caller_name", "personName", "person_name"], addPersonCandidate);

      addValues(metadata, [
        "businessName",
        "business_name",
        "companyName",
        "company_name",
        "organization",
        "organisation",
        "company",
        "business",
        "entityName",
        "entity_name"
      ], addBusinessCandidate);
      addValues(metadataCompany, [
        "name",
        "businessName",
        "business_name",
        "companyName",
        "company_name",
        "organization",
        "organisation"
      ], addBusinessCandidate);
      addValues(metadataBusinessInfo, ["name", "company", "company_name", "brand", "brand_name"], addBusinessCandidate);
      addValues(contact, ["company", "company_name", "business", "business_name", "organisation", "organization"], addBusinessCandidate);
      addValues(
        conversationCustomer,
        ["company", "company_name", "business", "business_name", "organisation", "organization"],
        addBusinessCandidate
      );
      addValues(payloadData, ["businessName", "business_name", "companyName", "company_name", "organization", "organisation"], addBusinessCandidate);
      addValues(payloadCompany, ["name", "businessName", "business_name", "companyName", "company_name"], addBusinessCandidate);
      addValues(analysis, ["businessName", "business_name", "companyName", "company_name", "organization", "organisation"], addBusinessCandidate);

      const entitiesRaw = analysis.entities;
      if (entitiesRaw) {
        let entitiesArray: unknown[] = [];
        
        if (Array.isArray(entitiesRaw)) {
          entitiesArray = entitiesRaw;
        } else if (typeof entitiesRaw === "object" && entitiesRaw !== null) {
          const entitiesObj = toPlainObject(entitiesRaw);
          if (entitiesObj && typeof entitiesObj === "object") {
            entitiesArray = Object.values(entitiesObj);
          }
        }
        
        for (const item of entitiesArray) {
          const entity = toPlainObject(item);
          const rawValue =
            typeof entity.value === "string"
              ? entity.value
              : typeof entity.name === "string"
              ? entity.name
              : typeof entity.text === "string"
              ? entity.text
              : null;
          if (!rawValue) continue;

          const normalizedValue = cleanCallerName(rawValue);
          if (!normalizedValue) continue;

          const typeTokens = [
            typeof entity.type === "string" ? entity.type.toLowerCase() : null,
            typeof entity.category === "string" ? entity.category.toLowerCase() : null,
            typeof entity.label === "string" ? entity.label.toLowerCase() : null,
            typeof entity.entity_type === "string" ? entity.entity_type.toLowerCase() : null,
            typeof entity.kind === "string" ? entity.kind.toLowerCase() : null
          ].filter((token): token is string => Boolean(token));

          if (typeTokens.some((token) => BUSINESS_ENTITY_TYPES.has(token))) {
            addBusinessCandidate(normalizedValue);
            continue;
          }

          if (typeTokens.some((token) => PERSON_ENTITY_TYPES.has(token))) {
            addPersonCandidate(normalizedValue);
            continue;
          }

          if (containsBusinessKeyword(normalizedValue)) {
            addBusinessCandidate(normalizedValue);
          } else {
            addPersonCandidate(normalizedValue);
          }
        }
      }

      const metadataNotesObject = toPlainObject(metadata.notes);
      const payloadNotesObject = toPlainObject(payloadData.notes);
      const conversationNotesObject = toPlainObject(conversation.notes);

      const summaryTexts = [
        summary,
        typeof analysis.summary === "string" ? analysis.summary : null,
        typeof analysis.transcript_summary === "string" ? analysis.transcript_summary : null,
        typeof metadata.summary === "string" ? metadata.summary : null,
        typeof metadata.notes === "string" ? metadata.notes : null,
        typeof payload.summary === "string" ? payload.summary : null,
        typeof payload.description === "string" ? payload.description : null,
        typeof metadataNotesObject.text === "string" ? metadataNotesObject.text : null,
        typeof metadataNotesObject.summary === "string" ? metadataNotesObject.summary : null,
        typeof payloadNotesObject.text === "string" ? payloadNotesObject.text : null,
        typeof conversationNotesObject.text === "string" ? conversationNotesObject.text : null
      ];

      for (const text of summaryTexts) {
        addTextMatchesToSet(text, SUMMARY_PERSON_PATTERNS, personCandidates, { allowDigits: false });
        addTextMatchesToSet(text, SUMMARY_BUSINESS_PATTERNS, businessCandidates);
      }

      addTextMatchesToSet(transcript, SUMMARY_BUSINESS_PATTERNS, businessCandidates);

      if (existingProfileRecord?.caller_name && existingProfileRecord.caller_name !== "Onbekende beller") {
        const existingTagsLower =
          Array.isArray(existingProfileRecord.tags)
            ? existingProfileRecord.tags
                .filter((tag): tag is string => typeof tag === "string")
                .map((tag) => tag.toLowerCase())
            : [];
        if (existingTagsLower.some((tag) => tag.includes("bedrijf"))) {
          addBusinessCandidate(existingProfileRecord.caller_name);
        } else {
          addPersonCandidate(existingProfileRecord.caller_name);
        }
      }

      if (Array.isArray(existingProfileRecord?.aka)) {
        for (const alias of existingProfileRecord.aka) {
          if (!alias) continue;
          const normalizedAlias = cleanCallerName(alias);
          if (!normalizedAlias) continue;
          if (containsBusinessKeyword(normalizedAlias)) {
            addBusinessCandidate(normalizedAlias);
          } else {
            addPersonCandidate(normalizedAlias);
          }
        }
      }

      personList = Array.from(personCandidates);
      businessList = Array.from(businessCandidates);

      let selectedEntityKind: "person" | "business" | null = null;
      let callerNameCandidate: string | null = null;

      const initialEntityTagCandidate = deriveEntityTag({
        summary,
        callerName: personList[0] ?? businessList[0] ?? undefined,
        metadata,
        analysis
      });

      if (initialEntityTagCandidate === "Bedrijf" && businessList.length > 0) {
        callerNameCandidate = businessList[0];
        selectedEntityKind = "business";
      } else if (initialEntityTagCandidate === "Particulier" && personList.length > 0) {
        callerNameCandidate = personList[0];
        selectedEntityKind = "person";
      }

      if (!callerNameCandidate && personList.length > 0) {
        callerNameCandidate = personList[0];
        selectedEntityKind = "person";
      }

      if (!callerNameCandidate && businessList.length > 0) {
        callerNameCandidate = businessList[0];
        selectedEntityKind = "business";
      }

      const existingCallerName =
        existingProfileRecord?.caller_name && existingProfileRecord.caller_name !== "Onbekende beller"
          ? existingProfileRecord.caller_name
          : null;

      if (!callerNameCandidate && existingCallerName) {
        callerNameCandidate = existingCallerName;
        selectedEntityKind =
          existingProfileRecord?.tags?.some(
            (tag) => typeof tag === "string" && tag.toLowerCase().includes("bedrijf")
          )
            ? "business"
            : "person";
      }

      if (!callerName) {
        callerName = cleanCallerName(callerNameCandidate) ?? existingCallerName ?? "Onbekende beller";
        if (!nameSource) {
          nameSource = "fallback";
        }
      }

      if (callerName && containsBusinessKeyword(callerName)) {
        selectedEntityKind = "business";
      }

      if (!selectedEntityKind && callerName && callerName !== "Onbekende beller") {
        selectedEntityKind = "person";
      }

      if (!entityTag) {
        if (selectedEntityKind === "business") {
          entityTag = "Bedrijf";
          if (!entityTypeSource) {
            entityTypeSource = "fallback";
          }
        } else if (selectedEntityKind === "person") {
          entityTag = "Particulier";
          if (!entityTypeSource) {
            entityTypeSource = "fallback";
          }
        } else {
          const fallbackTag = initialEntityTagCandidate;
          if (fallbackTag) {
            entityTag = fallbackTag;
            if (!entityTypeSource) {
              entityTypeSource = "fallback";
            }
          } else if (businessList.length > 0 && personList.length === 0) {
            entityTag = "Bedrijf";
            if (!entityTypeSource) {
              entityTypeSource = "fallback";
            }
          } else if (personList.length > 0 && businessList.length === 0) {
            entityTag = "Particulier";
            if (!entityTypeSource) {
              entityTypeSource = "fallback";
            }
          }
        }
      }
    }

    if (!callerName) {
      callerName = "Onbekende beller";
    }

    const callOutcomeCandidate = metadata.callOutcome ?? metadata.call_outcome;
    const allowedOutcomes: ProfileCallOutcome[] = ["confirmed", "voicemail", "pending"];
    const callOutcomeValue =
      typeof callOutcomeCandidate === "string" &&
      allowedOutcomes.includes(callOutcomeCandidate as ProfileCallOutcome)
        ? (callOutcomeCandidate as ProfileCallOutcome)
        : existingProfileRecord?.call_outcome ?? determineCallOutcome(summary);

    const metadataTags = Array.isArray(metadata.tags)
      ? metadata.tags
          .map((tag) => (typeof tag === "string" ? tag.trim() : null))
          .filter((tag): tag is string => Boolean(tag && tag.length > 0))
      : [];

    const existingTags = Array.isArray(existingProfileRecord?.tags)
      ? existingProfileRecord.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      : [];

    const tagMap = new Map<string, string>();
    for (const tag of [...existingTags, ...metadataTags]) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      tagMap.set(trimmed.toLowerCase(), trimmed);
    }

    if (entityTag) {
      tagMap.set(entityTag.toLowerCase(), entityTag);
    }

    const finalTags = Array.from(tagMap.values());

    const fallbackSummary = existingProfileRecord?.summary ?? existingProfileRecord?.transcript_preview ?? null;
    const effectiveSummary = summary ?? fallbackSummary ?? (transcript ? transcript.slice(0, 240) : null);
    const transcriptPreviewValue =
      transcript ?? existingProfileRecord?.transcript_preview ?? effectiveSummary ?? null;

    const confidenceValue =
      confidence ?? (typeof existingProfileRecord?.confidence === "number" ? existingProfileRecord.confidence : null);

    const aliasMap = new Map<string, string>();
    const addAlias = (value: unknown) => {
      const cleaned = cleanCallerName(value);
      if (!cleaned) return;
      if (cleaned === callerName) return;
      const lower = cleaned.toLowerCase();
      if (GENERIC_CALLER_LABELS.has(lower)) return;
      aliasMap.set(lower, cleaned);
    };

    if (Array.isArray(existingProfileRecord?.aka)) {
      for (const alias of existingProfileRecord.aka) {
        addAlias(alias);
      }
    }

    for (const entry of personList) {
      addAlias(entry);
    }

    for (const entry of businessList) {
      addAlias(entry);
    }

    const akaList = Array.from(aliasMap.values()).slice(0, 5);

    const profilePayload: UpsertProfileInput = {
      normalized: normalizedNumber,
      callerName,
      summary: effectiveSummary,
      transcriptPreview: transcriptPreviewValue ? transcriptPreviewValue.slice(0, 500) : null,
      lastChecked: endedAt ?? new Date().toISOString(),
      confidence: confidenceValue ?? undefined,
      callOutcome: callOutcomeValue,
      tags: finalTags,
      aka: akaList.length > 0 ? akaList : existingProfileRecord?.aka ?? [],
      nameSource: nameSource ?? null,
      entityTypeSource: entityTypeSource ?? null,
      elevenlabsRawResponse: payload ? JSON.parse(JSON.stringify(payload)) : null
    };

    if (IS_DEV) {
      console.log("💾 Upserting profile:", {
        normalized: profilePayload.normalized,
        callerName: profilePayload.callerName,
        nameSource: profilePayload.nameSource,
        entityTypeSource: profilePayload.entityTypeSource,
        hasRawResponse: !!profilePayload.elevenlabsRawResponse
      });
    }

    const upsertedId = await upsertPhoneProfile(profilePayload);
    if (upsertedId) {
      profileId = upsertedId;
      if (IS_DEV) {
        console.log("✅ Profile upserted successfully:", upsertedId);
      }
    } else {
      console.error("❌ Profile upsert failed - no ID returned");
    }
  }

  if (lookupStatus) {
    console.log("📝 Updating lookup status to:", {
      lookupId: effectiveLookupId,
      lookupStatus,
      profileId: profileId ?? null
    });
    await updateLookupStatus(effectiveLookupId, lookupStatus, profileId ?? undefined);
    console.log("✅ Lookup status updated successfully");
  } else {
    console.log("⏸️ Skipping lookup status update (lookupStatus is falsy):", {
      lookupId: effectiveLookupId,
      event,
      effectiveStatus,
      hasCompletedData,
      isPostCallEvent
    });
  }

  return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    console.error("❌ ElevenLabs webhook error:", {
      message: errorMessage,
      stack: errorStack,
      error
    });

    if (IS_DEV) {
      console.error("Full error details:", error);
    }

    return NextResponse.json(
      { 
        error: "Internal server error",
        message: IS_DEV ? errorMessage : "An error occurred processing the webhook"
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Handle Conversation Initiation Client Data Webhook
  // ElevenLabs may call this endpoint with GET to retrieve client data before starting a call
  const conversationId = request.nextUrl.searchParams.get("conversation_id") ?? 
                        request.nextUrl.searchParams.get("conversationId");
  
  if (IS_DEV) {
    console.log("📞 GET request to webhook endpoint (initiation client data):", {
      conversationId,
      queryParams: Object.fromEntries(request.nextUrl.searchParams.entries()),
      headers: Object.fromEntries(request.headers.entries())
    });
  }

  // For now, return success - the actual initiation will be detected via POST webhooks
  // This endpoint can be extended to return dynamic variables if needed
  return NextResponse.json({ 
    ok: true,
    note: "Initiation client data endpoint - initiation detected via POST webhooks",
    conversationId: conversationId ?? null
  });
}
