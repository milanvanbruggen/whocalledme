import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-6 py-16">
      <div className="max-w-md rounded-2xl border border-border bg-card/80 p-8 text-center shadow-sm backdrop-blur">
        <span className="text-sm font-semibold uppercase tracking-wide text-primary">
          Niet gevonden
        </span>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">We konden dit nummer niet lezen</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Controleer of je een geldig telefoonnummer hebt ingevoerd. Gebruik internationale notatie,
          bijvoorbeeld <span className="font-mono text-foreground">+31612345678</span>.
        </p>
        <Link
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
          href="/"
        >
          Terug naar de zoekpagina
        </Link>
      </div>
    </main>
  );
}

