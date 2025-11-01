"use server";

import crypto from "node:crypto";

import { emailSignupSchema } from "@/lib/forms";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type SubscribeSuccess = {
  status: "success";
  message: string;
  reference: string;
};

type SubscribeError = {
  status: "error";
  message: string;
};

export type SubscribeResult = SubscribeSuccess | SubscribeError;

const TABLE_NAME = "beta_subscriptions";

export async function subscribeToBeta(input: { email: string }): Promise<SubscribeResult> {
  const { email } = emailSignupSchema.parse(input);

  const supabase = getSupabaseAdminClient();

  const reference = crypto.createHash("sha1").update(email).digest("hex").slice(0, 8);

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .upsert(
      {
        email,
        reference
      },
      { onConflict: "email", ignoreDuplicates: false }
    )
    .select("reference")
    .single();

  if (error) {
    if (error.code === "42501") {
      return {
        status: "error",
        message: "Supabase mist permissies voor upsert. Controleer RLS- en API-instellingen."
      };
    }

    return {
      status: "error",
      message: "We konden je inschrijving niet opslaan. Probeer het later opnieuw."
    };
  }

  return {
    status: "success",
    message: "Je staat op de beta-wachtlijst. We sturen binnenkort een update!",
    reference: data.reference
  };
}

