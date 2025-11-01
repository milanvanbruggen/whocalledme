const FAQ_ENTRIES = [
  {
    question: "Wat kost AI Caller ID?",
    answer:
      "Tijdens de beta is elke lookup gratis. We vragen alleen om feedback zodat we de herkenningsgraad kunnen verbeteren."
  },
  {
    question: "Worden opnames publiek gemaakt?",
    answer:
      "Alleen de transcript-samenvatting en metadata verschijnen op de profielpagina. Audio blijft privé en wordt na 30 dagen verwijderd."
  },
  {
    question: "Kan ik een nummer laten verwijderen?",
    answer:
      "Ja, via de verwijderpagina kun je aantonen dat je eigenaar bent van het nummer en kies je wat publiek zichtbaar blijft."
  }
];

export function FaqSection() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-20 sm:py-24">
        <header className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            Veelgestelde vragen
          </span>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Alles wat je wilt weten voor je start
          </h2>
        </header>
        <dl className="space-y-6">
          {FAQ_ENTRIES.map((item) => (
            <div
              key={item.question}
              className="rounded-2xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur"
            >
              <dt className="text-lg font-semibold text-foreground">{item.question}</dt>
              <dd className="mt-2 text-sm text-muted-foreground">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

