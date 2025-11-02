import { z } from "zod";

const SANITIZE_PATTERN = /[\s\-().]/g;
// Alleen internationale nummers accepteren die beginnen met +
// Minimaal 7 cijfers na de + (landcode 1-3 cijfers + minstens 4 cijfers voor het nummer)
// Dit komt overeen met de kortste geldige internationale nummers
const INTERNATIONAL_PATTERN = /^\+\d{7,15}$/;

/**
 * Schema that normalises the phone number before continuing with lookups.
 * - Strips spaces, dashes, dots and parentheses.
 * - Accepts only international format starting with `+` (e.g., `+31628153017`).
 * - Converts `00` prefixes to `+` for user convenience.
 * - Validates minimum length: at least 10 characters total (including + and country code).
 */
export const phoneNumberSchema = z
  .string()
  .trim()
  .min(10, "Telefoonnummer is te kort. Voer een volledig nummer in (bijvoorbeeld: +31628153017).")
  .max(20, "Telefoonnummer is te lang.")
  .transform((value) => value.replace(SANITIZE_PATTERN, ""))
  .transform((value) => {
    // Converteer 00 naar + voor gebruikersgemak
    if (value.startsWith("00")) {
      return `+${value.slice(2)}`;
    }
    return value;
  })
  .refine(
    (value) => {
      // Alleen internationale nummers die beginnen met + en minimaal 7 cijfers hebben
      // Na de + moet er minimaal een landcode (1-3 cijfers) + nummer (minimaal 4 cijfers) zijn
      return INTERNATIONAL_PATTERN.test(value);
    },
    { message: "Voer een geldig internationaal telefoonnummer in. Start met + en de landcode (bijvoorbeeld: +31628153017)." }
  );

export type PhoneNumber = z.infer<typeof phoneNumberSchema>;

export const phoneLookupSchema = z.object({
  phoneNumber: phoneNumberSchema
});

export type PhoneLookupInput = z.infer<typeof phoneLookupSchema>;

export function parsePhoneNumber(input: string): PhoneNumber {
  return phoneNumberSchema.parse(input);
}

export function validatePhoneNumber(input: string) {
  const result = phoneNumberSchema.safeParse(input);
  if (!result.success) {
    return {
      success: false,
      message: result.error.issues[0]?.message ?? "Voer een geldig telefoonnummer in."
    } as const;
  }

  return { success: true, phoneNumber: result.data } as const;
}

