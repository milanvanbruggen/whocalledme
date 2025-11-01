import Link from "next/link";

import { listMockProfiles } from "@/lib/mock-profiles";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { listRecentProfiles } from "@/lib/supabase/lookups";

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Bevestigd",
  voicemail: "Voicemail",
  pending: "In behandeling"
};

export async function RecentLookupsSection() {
  const supabaseProfiles = await listRecentProfiles(3);
  const profiles =
    supabaseProfiles.length > 0
      ? supabaseProfiles
      : listMockProfiles()
          .slice()
          .sort((a, b) => new Date(b.lastChecked).getTime() - new Date(a.lastChecked).getTime())
          .slice(0, 3);

  return (
    <section className="border-t border-border bg-card/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-20 sm:py-24">
        <header className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            Recente lookup-resultaten
          </span>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Dit ontdekte de AI-detective onlangs
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Iedere lookup maakt een openbaar profiel zodat anderen weten wie er belt.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-3">
          {profiles.map((profile) => (
            <article
              key={profile.normalized}
              className="flex h-full flex-col justify-between rounded-2xl border border-border bg-background/90 p-6 text-left shadow-sm"
            >
              <div>
                <Badge variant={profile.callOutcome === "confirmed" ? "success" : "secondary"}>
                  {STATUS_LABELS[profile.callOutcome]}
                </Badge>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {profile.callerName}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-4">
                  {profile.summary}
                </p>
              </div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div className="font-mono text-xs text-foreground">{profile.normalized}</div>
                <div>Laatst geverifieerd: {formatDateTime(profile.lastChecked)}</div>
              </div>
              <Link
                className="mt-4 inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                href={`/nummer/${encodeURIComponent(profile.normalized)}`}
              >
                Bekijk profiel
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
