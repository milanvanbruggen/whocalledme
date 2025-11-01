"use client";

import * as React from "react";

import { subscribeToBeta } from "@/app/actions/subscribe";
import { validateEmailSignup } from "@/lib/forms";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type FormStatus = "idle" | "validating" | "submitting" | "success" | "error";

export function SubscribeForm() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<FormStatus>("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [reference, setReference] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setReference(null);
    setStatus("validating");

    const validation = validateEmailSignup(email);
    if (!validation.success) {
      setStatus("error");
      setMessage(validation.message);
      return;
    }

    startTransition(() => {
      setStatus("submitting");
      subscribeToBeta(validation.data)
        .then((result) => {
          if (result.status === "success") {
            setStatus("success");
            setMessage(result.message);
            setReference(result.reference);
            setEmail("");
            return;
          }

          setStatus("error");
          setMessage(result.message);
        })
        .catch(() => {
          setStatus("error");
          setMessage("Er ging iets mis. Probeer het over een paar minuten opnieuw.");
        });
    });
  };

  return (
    <form className="flex w-full flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleSubmit}>
      <Input
        aria-describedby="subscribe-feedback"
        aria-invalid={status === "error"}
        autoComplete="email"
        inputMode="email"
        name="email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="jij@bedrijf.nl"
        type="email"
        value={email}
        disabled={isPending}
        className="sm:flex-1"
      />
      <Button
        className="shrink-0 sm:h-11 sm:px-6"
        disabled={isPending}
        type="submit"
        variant="default"
      >
        {isPending ? "Versturen…" : "Op wachtlijst"}
      </Button>
      <p className="text-left text-sm text-muted-foreground sm:w-full" id="subscribe-feedback">
        {message ??
          (status === "submitting"
            ? "We verwerken je inschrijving…"
            : "We sturen alleen updates over de beta en belangrijke statuswijzigingen.")}
        {status === "success" && reference ? (
          <span className="ml-1 font-mono text-xs text-foreground">Referentie: {reference}</span>
        ) : null}
      </p>
    </form>
  );
}

