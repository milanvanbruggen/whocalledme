import { ShieldCheck, Lock, Clock } from "lucide-react";

const SIGNALS = [
  {
    icon: ShieldCheck,
    title: "GDPR-proof script",
    description: "Agent start elk gesprek met een toestemmingstekst en stopt zodra iemand weigert."
  },
  {
    icon: Lock,
    title: "Data-retentie 30 dagen",
    description: "Audio-opnames worden automatisch verwijderd en we bewaren enkel geanonimiseerde transcripts."
  },
  {
    icon: Clock,
    title: "Realtime status updates",
    description: "Via Supabase of webhooks zie je meteen wanneer de call voltooid is of opnieuw wordt geprobeerd."
  }
];

export function TrustSignalsSection() {
  return (
    <section className="border-t border-border bg-card/30">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-20 sm:py-24">
        <header className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            Vertrouwen & privacy
          </span>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Privacy en betrouwbaarheid voorop
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Elke call volgt vaste protocollen zodat je zeker weet dat informatie correct en rechtmatig
            is verzameld.
          </p>
        </header>
        <div className="grid gap-6 sm:grid-cols-3">
          {SIGNALS.map((signal) => (
            <article
              key={signal.title}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-background/90 p-6 text-left shadow-sm"
            >
              <signal.icon className="h-8 w-8 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">{signal.title}</h3>
              <p className="text-sm text-muted-foreground">{signal.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

