import * as React from "react";

import { cn } from "@/lib/utils";

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string;
  hint?: string;
}

export function StatCard({ label, value, hint, className, ...props }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/60 p-6 text-left shadow-sm backdrop-blur",
        className
      )}
      {...props}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
      {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

