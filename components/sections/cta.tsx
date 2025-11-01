import { SubscribeForm } from "@/components/subscribe-form";

export function CtaSection() {
  return (
    <section className="border-t border-border bg-gradient-to-r from-primary/10 via-background to-primary/10">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20">
        <h2 className="text-3xl font-semibold text-foreground sm:text-4xl">
          Wil je een nummer claimen of updates ontvangen?
        </h2>
        <p className="text-base text-muted-foreground sm:text-lg">
          Bedrijven kunnen hun profiel verifiëren en bezoekers op de hoogte houden van nieuwe
          transcripts. Laat je e-mailadres achter zodat we je uitnodigen voor de beta.
        </p>
        <div className="w-full max-w-xl">
          <SubscribeForm />
        </div>
      </div>
    </section>
  );
}
