const STEPS: Array<{ title: string; description: string }> = [
  {
    title: "Voer het nummer in",
    description: "Gebruik internationale of nationale notatie. Wij normaliseren het nummer automatisch."
  },
  {
    title: "AI-agent belt direct",
    description: "Onze stemassistent vraagt naar de naam, noteert context en bewaakt de compliance script."
  },
  {
    title: "Ontvang resultaat & transcript",
    description: "Je ziet de identificatie, call-status en een korte samenvatting zodra de call voltooid is."
  }
];

export function HowItWorksSection() {
  return (
    <section className="relative overflow-hidden border-t border-border bg-card/40">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_bottom,_hsla(258,66%,55%,0.18),_transparent_60%)]" />
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-20 sm:py-24">
        <header className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            Hoe het werkt
          </span>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Transparant in drie stappen
          </h2>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            De hele flow blijft onder één minuut en gebruikt gescripte toestemming om aan GDPR te
            voldoen.
          </p>
        </header>
        <div className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <article
              key={step.title}
              className="rounded-2xl border border-border bg-background/80 p-6 shadow-sm"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                {index + 1}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

