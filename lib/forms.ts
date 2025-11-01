import { z } from "zod";

export const emailSignupSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(3, "Voer een geldig e-mailadres in.")
      .max(160, "E-mailadres is te lang.")
      .email("Voer een geldig e-mailadres in.")
  })
  .transform((data) => ({
    email: data.email.toLowerCase()
  }));

export type EmailSignupInput = z.infer<typeof emailSignupSchema>;

export function validateEmailSignup(email: string) {
  const result = emailSignupSchema.safeParse({ email });
  if (!result.success) {
    return {
      success: false,
      message: result.error.issues[0]?.message ?? "Voer een geldig e-mailadres in."
    } as const;
  }

  return { success: true, data: result.data } as const;
}

