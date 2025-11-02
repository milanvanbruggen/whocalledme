declare module 'google-libphonenumber' {
  export class PhoneNumberUtil {
    static getInstance(): PhoneNumberUtil;
    parseAndKeepRawInput(number: string, region?: string): PhoneNumber;
    getRegionCodeForNumber(number: PhoneNumber): string | null;
    isValidNumber(number: PhoneNumber): boolean;
    isPossibleNumber(number: PhoneNumber): boolean;
    getMetadataForRegion(region: string): Metadata | null;
  }

  export class PhoneNumber {
    getCountryCode(): number;
  }

  export class Metadata {
    getGeneralDesc(): GeneralDesc | null;
  }

  export class GeneralDesc {
    getPossibleLengthList(): number[];
    getPossibleLengthLocalOnlyList(): number[];
  }
}

