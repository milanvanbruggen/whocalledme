import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { parsePhoneNumber } from "@/lib/phone";
import { getMockProfile } from "@/lib/mock-profiles";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime } from "@/lib/format";
import { fetchProfileByNumber } from "@/lib/supabase/lookups";

type PageParams = {
  params: {
    digits: string;
  };
};

function decodePhoneParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const raw = decodePhoneParam(params.digits);

  try {
    const normalized = parsePhoneNumber(raw);
    const profile = getMockProfile(normalized);
    const callerName = profile?.callerName ?? "Onbekende beller";
    const description = profile
      ? `AI Caller ID identificeerde ${profile.callerName}. Lees de samenvatting, transcript en status van ${normalized}.`
      : `AI Caller ID onderzoekt nummer ${normalized}. Volg de status van onze AI-call en ontdek wie er opneemt.`;

    return {
      title: `${callerName} · Nummer ${normalized}`,
      description,
      alternates: {
        canonical: `/nummer/${encodeURIComponent(normalized)}`
      },
      openGraph: {
        title: `${callerName} · AI Caller ID`,
        description,
        url: `/nummer/${encodeURIComponent(normalized)}`,
        type: "article",
        locale: "nl_NL"
      }
    };
  } catch {
    return {
      title: "Onbekend nummer · AI Caller ID",
      description: "Zoek uit wie er belde met behulp van onze AI-detective."
    };
  }
}

export default async function NumberProfilePage({ params }: PageParams) {
  const raw = decodePhoneParam(params.digits);

  let normalized: string;
  try {
    normalized = parsePhoneNumber(raw);
  } catch {
    notFound();
  }

  const profileFromSupabase = await fetchProfileByNumber(normalized);
  const profile = profileFromSupabase ?? getMockProfile(normalized);
  const structuredData = profile
    ? {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: profile.callerName,
        telephone: profile.normalized,
        description: profile.summary,
        alternateName: profile.aka,
        dateModified: new Date(profile.lastChecked).toISOString(),
        additionalProperty: [
          {
            "@type": "PropertyValue",
            name: "Call status",
            value: profile.callOutcome
          },
          {
            "@type": "PropertyValue",
            name: "Confidence",
            value: `${Math.round(profile.confidence * 100)}%`
          }
        ],
        areaServed: "NL",
        availableLanguage: ["nl"]
      }
    : null;

  return (
    <main className="bg-gradient-to-br from-background via-background to-muted pb-16">
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      ) : null}
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <Link
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          href="/"
        >
          ← Terug naar zoekpagina
        </Link>

        <header className="mt-8 rounded-2xl border border-border bg-card/70 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={profile ? "success" : "outline"}>
              {profile ? "Geïdentificeerd" : "Onderzoek gestart"}
            </Badge>
            <div className="text-xs text-muted-foreground">
              Laatste update:{" "}
              {profile ? formatDateTime(profile.lastChecked) : "wordt ingepland"}
            </div>
          </div>
          <h1 className="mt-6 text-balance text-4xl font-semibold">
            {profile?.callerName ?? "AI-onderzoek naar onbekend nummer"}
          </h1>
          <p className="mt-4 text-balance text-muted-foreground">
            Nummer: <span className="font-mono text-foreground">{normalized}</span>
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {(profile?.tags ?? ["In onderzoek"]).map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </header>

        {profile ? (
          <section className="mt-10 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
            <article className="rounded-2xl border border-border bg-card/60 p-8 shadow-sm backdrop-blur">
              <h2 className="text-xl font-semibold">Wat we weten</h2>
              <p className="mt-3 text-sm text-muted-foreground">{profile.summary}</p>

              <div className="mt-6 space-y-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Transcript hoogtepunten
                  </div>
                  <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                    “{profile.transcriptPreview}”
                  </p>
                </div>

                {profile.aka?.length ? (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ook bekend als
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-2 text-sm text-foreground">
                      {profile.aka.map((alias) => (
                        <li
                          key={alias}
                          className="rounded-full border border-border bg-background/80 px-3 py-1"
                        >
                          {alias}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </article>

            <aside className="space-y-4">
              <StatCard
                label="Vertrouwen"
                value={`${Math.round(profile.confidence * 100)}%`}
                hint="Gebaseerd op AI-transcript analyse en bevestigingen."
              />
              <StatCard
                label="Bevestigingen"
                value={`${profile.reports.confirmedCount} gebruikers`}
                hint={`${profile.reports.disputedCount} meldingen van twijfel`}
              />
              <div className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur">
                <h3 className="text-base font-semibold">Volgende stappen</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Wil je een nieuw gesprek starten of updates ontvangen wanneer er nieuwe
                  informatie is? Keer terug naar de zoekpagina en plan een call in.
                </p>
                <Link
                  className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
                  href="/#lookup"
                >
                  Start nieuwe lookup
                </Link>
              </div>
            </aside>
          </section>
        ) : (
          <section className="mt-10 rounded-2xl border border-dashed border-primary/30 bg-card/50 p-8 text-center shadow-sm backdrop-blur">
            <h2 className="text-xl font-semibold">We starten een AI-call voor dit nummer</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Nog geen transcript beschikbaar. Plan een call vanaf de homepage en we sturen je een
              update zodra de agent klaar is.
            </p>
            <Link
              className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
              href="/#lookup"
            >
              Plan AI-call
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}
