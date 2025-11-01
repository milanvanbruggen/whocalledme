import { z } from "zod";

const SANITIZE_PATTERN = /[\s\-().]/g;
const INTERNATIONAL_PATTERN = /^(\+|00)\d{6,15}$/;
const NATIONAL_PATTERN = /^0\d{6,15}$/;

/**
 * Schema that normalises the phone number before continuing with lookups.
 * - Strips spaces, dashes, dots and parentheses.
 * - Accepts international prefixes (`+31`, `0031`) and national format (`06`).
 * - Converts `00` prefixes to `+` for consistency.
 */
export const phoneNumberSchema = z
  .string()
  .trim()
  .min(6, "Voer een geldig telefoonnummer in.")
  .max(20, "Telefoonnummer is te lang.")
  .transform((value) => value.replace(SANITIZE_PATTERN, ""))
  .refine(
    (value) => {
      if (INTERNATIONAL_PATTERN.test(value)) return true;
      if (NATIONAL_PATTERN.test(value)) return true;
      return false;
    },
    { message: "Voer een geldig telefoonnummer in." }
  )
  .transform((value) => {
    if (value.startsWith("00")) {
      return `+${value.slice(2)}`;
    }

    return value;
  });

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

