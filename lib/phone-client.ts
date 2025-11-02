"use client";

import { PhoneNumberUtil } from "google-libphonenumber";

const phoneUtil = PhoneNumberUtil.getInstance();

/**
 * Client-side validatie van telefoonnummers met google-libphonenumber.
 * Geeft landspecifieke feedback over minimale en maximale lengte.
 */
export function validatePhoneNumberClient(value: string): {
  success: boolean;
  message: string;
  isValid: boolean;
  country?: string;
  minLength?: number;
  maxLength?: number;
} {
  if (!value || value.trim().length === 0) {
    return {
      success: false,
      message: "Voer een telefoonnummer in.",
      isValid: false
    };
  }

  // Sanitize het nummer (verwijder spaties, etc.)
  const sanitized = value.replace(/[\s\-().]/g, "");

  // Check minimale lengte (algemeen)
  if (sanitized.length < 7) {
    return {
      success: false,
      message: "Telefoonnummer is te kort. Voer een volledig nummer in.",
      isValid: false
    };
  }

  // Check of het begint met +
  if (!sanitized.startsWith("+")) {
    return {
      success: false,
      message: "Voer een internationaal telefoonnummer in dat begint met + (bijvoorbeeld: +31628153017).",
      isValid: false
    };
  }

  // Valideer met google-libphonenumber
  try {
    const number = phoneUtil.parseAndKeepRawInput(sanitized);
    const countryCode = phoneUtil.getRegionCodeForNumber(number);
    const isValid = phoneUtil.isValidNumber(number);

    // Haal landspecifieke lengte informatie op
    let minLength: number | undefined;
    let maxLength: number | undefined;
    let expectedLength: string | undefined;

    if (countryCode) {
      try {
        const metadata = phoneUtil.getMetadataForRegion(countryCode);
        if (metadata) {
          const generalDesc = metadata.getGeneralDesc();
          if (generalDesc) {
            // Haal mogelijke lengtes op
            const possibleLengths: number[] = [];
            const possibleLengthList = generalDesc.getPossibleLengthList();
            const localOnlyLengths = generalDesc.getPossibleLengthLocalOnlyList();
            
            // Filter lokale-only lengtes eruit
            for (let i = 0; i < possibleLengthList.length; i++) {
              const length = possibleLengthList[i];
              if (!localOnlyLengths.includes(length)) {
                possibleLengths.push(length);
              }
            }
            
            if (possibleLengths.length > 0) {
              const nationalMin = Math.min(...possibleLengths);
              const nationalMax = Math.max(...possibleLengths);
              
              // Voeg landcode lengte toe
              const countryCallingCode = number.getCountryCode();
              const countryCodeLength = countryCallingCode.toString().length;
              minLength = nationalMin + countryCodeLength + 1; // +1 voor de +
              maxLength = nationalMax + countryCodeLength + 1;
              
              if (nationalMin === nationalMax) {
                expectedLength = `${nationalMin} cijfers`;
              } else {
                expectedLength = `${nationalMin}-${nationalMax} cijfers`;
              }
            }
          }
        }
      } catch {
        // Als metadata ophalen mislukt, gebruik algemene validatie
        console.warn("Could not fetch metadata for country:", countryCode);
      }
    }

    if (!isValid) {
      // Controleer eerst of het nummer mogelijk is (juiste lengte)
      const isPossible = phoneUtil.isPossibleNumber(number);
      const countryName = countryCode ? getCountryName(countryCode) : "dit land";

      if (!isPossible && minLength && maxLength) {
        return {
          success: false,
          message: `Dit nummer heeft niet de juiste lengte voor ${countryName}. Verwacht: ${expectedLength}.`,
          isValid: false,
          country: countryCode ?? undefined,
          minLength,
          maxLength
        };
      }

      // Geef landspecifieke foutmelding
      const message = expectedLength
        ? `Dit is geen geldig ${countryName} telefoonnummer. Verwacht: ${expectedLength}.`
        : `Dit is geen geldig ${countryName} telefoonnummer. Controleer het nummer en probeer het opnieuw.`;

      return {
        success: false,
        message,
        isValid: false,
        country: countryCode ?? undefined,
        minLength,
        maxLength
      };
    }

    return {
      success: true,
      message: "",
      isValid: true,
      country: countryCode ?? undefined,
      minLength,
      maxLength
    };
  } catch {
    // Als parsing mislukt, gebruik basisvalidatie
    if (!/^\+\d{7,15}$/.test(sanitized)) {
      return {
        success: false,
        message: "Voer een geldig internationaal telefoonnummer in. Start met + en de landcode (bijvoorbeeld: +31628153017).",
        isValid: false
      };
    }

    // Zelfs als parsing mislukt maar het patroon klopt, accepteer het
    // (sommige nieuwe landcodes worden mogelijk niet ondersteund)
    return {
      success: true,
      message: "",
      isValid: true
    };
  }
}

/**
 * Helper functie om landnamen te krijgen
 */
function getCountryName(countryCode: string): string {
  const countryNames: Record<string, string> = {
    nl: "Nederlands",
    be: "Belgisch",
    de: "Duits",
    fr: "Frans",
    gb: "Brits",
    us: "Amerikaans",
    es: "Spaans",
    it: "Italiaans",
    pt: "Portugees",
    pl: "Pools",
    np: "Nepalees"
  };
  return countryNames[countryCode.toLowerCase()] || countryCode.toUpperCase();
}

