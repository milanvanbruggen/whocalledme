import { parsePhoneNumber } from "@/lib/phone";

export type CallOutcome = "confirmed" | "voicemail" | "pending";

export interface NumberProfile {
  normalized: string;
  callerName: string;
  aka?: string[];
  summary: string;
  transcriptPreview: string;
  lastChecked: string;
  confidence: number;
  callOutcome: CallOutcome;
  reports: {
    confirmedCount: number;
    disputedCount: number;
  };
  tags: string[];
}

type ProfileMap = Record<string, NumberProfile>;

const MOCK_PROFILES: ProfileMap = (() => {
  const profiles: Array<NumberProfile> = [
    {
      normalized: parsePhoneNumber("+31612345678"),
      callerName: "Noorderlicht Fietskoerier",
      aka: ["NL Fietskoerier"],
      summary: "Bezorgt vaak pakketten in de Randstad en vraagt bevestiging van ontvangst.",
      transcriptPreview:
        "Goedemiddag! U spreekt met Noorderlicht Fietskoerier. Dit is een bevestiging voor uw levering van vanavond.",
      lastChecked: "2025-02-11T09:12:00.000Z",
      confidence: 0.88,
      callOutcome: "confirmed",
      reports: {
        confirmedCount: 18,
        disputedCount: 1
      },
      tags: ["Logistiek", "Betrouwbaar"]
    },
    {
      normalized: parsePhoneNumber("+31201234567"),
      callerName: "Stichting Waterwacht",
      summary: "Fondsenwervende organisatie die donateurs opbelt voor een jaarlijkse bijdrage.",
      transcriptPreview:
        "Hallo! We bellen namens Stichting Waterwacht om u te bedanken voor uw steun en een update te geven.",
      lastChecked: "2025-02-08T16:35:00.000Z",
      confidence: 0.74,
      callOutcome: "voicemail",
      reports: {
        confirmedCount: 9,
        disputedCount: 0
      },
      tags: ["Goede doelen", "Voicemail"]
    },
    {
      normalized: parsePhoneNumber("+31611122233"),
      callerName: "Onbekende lead agent",
      summary: "AI-agent trof een wachtrij zonder naam; herhaalcall gepland.",
      transcriptPreview:
        "We hoorden alleen een keuzemenu zonder naam. We proberen het nummer later opnieuw.",
      lastChecked: "2025-02-10T19:05:00.000Z",
      confidence: 0.47,
      callOutcome: "pending",
      reports: {
        confirmedCount: 2,
        disputedCount: 3
      },
      tags: ["Nog onderzoeken", "Mogelijk callcenter"]
    }
  ];

  return Object.fromEntries(profiles.map((profile) => [profile.normalized, profile]));
})();

export function getMockProfile(normalized: string): NumberProfile | null {
  return MOCK_PROFILES[normalized] ?? null;
}

export function listMockProfiles(): NumberProfile[] {
  return Object.values(MOCK_PROFILES);
}
