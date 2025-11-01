import { LookupForm } from "@/components/lookup-form";
import { HowItWorksSection } from "@/components/sections/how-it-works";
import { TrustSignalsSection } from "@/components/sections/trust-signals";
import { FaqSection } from "@/components/sections/faq";
import { RecentLookupsSection } from "@/components/sections/recent-lookups";
import { CtaSection } from "@/components/sections/cta";

export default function HomePage() {
  return (
    <main className="relative isolate min-h-[calc(100vh-4rem)] overflow-hidden bg-gradient-to-br from-background via-background to-muted">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_hsla(258,66%,55%,0.18),_transparent_55%)]" />
      <section className="px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
            AI Caller ID · Beta
          </span>
          <h1 className="mt-6 text-balance text-4xl font-semibold leading-tight text-foreground sm:text-5xl">
            Ontmasker onbekende nummers met een slimme AI-detective
          </h1>
          <p className="mt-4 text-balance text-lg text-muted-foreground sm:text-xl">
            Voer het nummer in dat je belde. Onze AI-agent neemt contact op, identificeert de
            afzender en deelt een transcript in onze publieke database.
          </p>
          <div className="gradient-border glass mt-10 p-6 shadow-xl sm:p-8" id="lookup">
            <LookupForm />
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            We bellen alleen met toestemming en bewaren gesprekken maximaal 30 dagen voor analyse.
          </p>
        </div>
      </section>
      <HowItWorksSection />
      <RecentLookupsSection />
      <TrustSignalsSection />
      <FaqSection />
      <CtaSection />
      <footer className="pb-12 text-center text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} AI Caller ID · </span>
        <a className="underline-offset-4 hover:underline" href="#">
          Privacy
        </a>
        <span> · </span>
        <a className="underline-offset-4 hover:underline" href="#">
          Verwijderen van gegevens
        </a>
      </footer>
    </main>
  );
}
