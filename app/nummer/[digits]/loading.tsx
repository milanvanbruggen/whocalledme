export default function LoadingNumberProfile() {
  return (
    <main className="bg-gradient-to-br from-background via-background to-muted pb-16">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <div className="mb-10 h-4 w-32 animate-pulse rounded-full bg-muted" />
        <div className="space-y-6 rounded-2xl border border-border bg-card/70 p-8 shadow-sm backdrop-blur">
          <div className="h-6 w-48 animate-pulse rounded-full bg-muted" />
          <div className="h-10 w-3/4 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
          <div className="flex gap-3">
            <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-8 shadow-sm backdrop-blur">
            <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
            <div className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded-md bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
          <div className="space-y-4">
            <div className="h-32 animate-pulse rounded-2xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur" />
            <div className="h-32 animate-pulse rounded-2xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur" />
            <div className="h-40 animate-pulse rounded-2xl border border-border bg-card/60 p-6 shadow-sm backdrop-blur" />
          </div>
        </div>
      </div>
    </main>
  );
}

