import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";

export const COUNTRIES = [
  { code: "IN", name: "India", dial: "+91", flag: "🇮🇳", localFormat: "10 digits", minLength: 10, maxLength: 10, placeholder: "9876543210" },
  { code: "AE", name: "UAE", dial: "+971", flag: "🇦🇪", localFormat: "9 digits", minLength: 9, maxLength: 9, placeholder: "501234567" },
  { code: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦", localFormat: "9 digits", minLength: 9, maxLength: 9, placeholder: "501234567" },
  { code: "QA", name: "Qatar", dial: "+974", flag: "🇶🇦", localFormat: "8 digits", minLength: 8, maxLength: 8, placeholder: "33123456" },
  { code: "KW", name: "Kuwait", dial: "+965", flag: "🇰🇼", localFormat: "8 digits", minLength: 8, maxLength: 8, placeholder: "51234567" },
  { code: "OM", name: "Oman", dial: "+968", flag: "🇴🇲", localFormat: "8 digits", minLength: 8, maxLength: 8, placeholder: "91234567" },
  { code: "BH", name: "Bahrain", dial: "+973", flag: "🇧🇭", localFormat: "8 digits", minLength: 8, maxLength: 8, placeholder: "36123456" },
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸", localFormat: "10 digits", minLength: 10, maxLength: 10, placeholder: "2025550123" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦", localFormat: "10 digits", minLength: 10, maxLength: 10, placeholder: "4165550123" },
  { code: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧", localFormat: "10 digits", minLength: 10, maxLength: 10, placeholder: "7911123456" },
  { code: "AU", name: "Australia", dial: "+61", flag: "🇦🇺", localFormat: "9 digits", minLength: 9, maxLength: 9, placeholder: "412345678" },
  { code: "NZ", name: "New Zealand", dial: "+64", flag: "🇳🇿", localFormat: "9 digits", minLength: 8, maxLength: 10, placeholder: "211234567" },
  { code: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬", localFormat: "8 digits", minLength: 8, maxLength: 8, placeholder: "81234567" },
  { code: "MY", name: "Malaysia", dial: "+60", flag: "🇲🇾", localFormat: "9–10 digits", minLength: 9, maxLength: 10, placeholder: "123456789" },
  { code: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦", localFormat: "9 digits", minLength: 9, maxLength: 9, placeholder: "711234567" },
  { code: "DE", name: "Germany", dial: "+49", flag: "🇩🇪", localFormat: "10–11 digits", minLength: 10, maxLength: 11, placeholder: "15112345678" },
  { code: "FR", name: "France", dial: "+33", flag: "🇫🇷", localFormat: "9 digits", minLength: 9, maxLength: 9, placeholder: "612345678" },
  { code: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱", localFormat: "9 digits", minLength: 9, maxLength: 9, placeholder: "612345678" },
  { code: "CH", name: "Switzerland", dial: "+41", flag: "🇨🇭", localFormat: "9 digits", minLength: 9, maxLength: 9, placeholder: "781234567" },
  { code: "JP", name: "Japan", dial: "+81", flag: "🇯🇵", localFormat: "10 digits", minLength: 10, maxLength: 10, placeholder: "9012345678" },
] as const;

export type SupportedCountryCode = typeof COUNTRIES[number]["code"];
export type PatientContactError = "missing" | "invalid_country" | "invalid_phone";

export type PhoneValidationResult = {
  valid: true;
  e164: string;
  countryCode: SupportedCountryCode;
} | {
  valid: false;
  error: PatientContactError;
  message: string;
};

export function getCountry(countryCode: string) {
  const normalizedCode = countryCode.trim().toUpperCase();
  return COUNTRIES.find((country) => country.code === normalizedCode);
}

export function getCountryCode(countryCode: string): SupportedCountryCode | undefined {
  return getCountry(countryCode)?.code;
}

export function detectCountryFromPhone(phoneInput: string | null | undefined): typeof COUNTRIES[number] | undefined {
  if (!phoneInput || typeof phoneInput !== "string") return undefined;
  const trimmed = phoneInput.trim();
  if (!trimmed) return undefined;

  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;

  try {
    const parsed = parsePhoneNumberFromString(withPlus);
    if (parsed && parsed.country) {
      const match = COUNTRIES.find((c) => c.code === parsed.country);
      if (match) return match;
    }
  } catch {}

  const sortedByDial = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sortedByDial) {
    if (withPlus.startsWith(c.dial)) {
      return c;
    }
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return COUNTRIES.find((c) => c.code === "IN");
  }

  return undefined;
}

export function getPhoneHint(countryCode: string): string {
  const country = getCountry(countryCode);
  return country ? `${country.localFormat} after ${country.dial}` : "Enter a valid local phone number";
}

export function validatePatientPhone(phoneInput: string, countryCode: string): PhoneValidationResult {
  const country = getCountry(countryCode);
  if (!country) {
    return { valid: false, error: "invalid_country", message: "Please select a supported country." };
  }

  const input = typeof phoneInput === "string" ? phoneInput.trim() : "";
  if (!input) {
    return {
      valid: false,
      error: "missing",
      message: `Please enter your phone number (${country.localFormat} after ${country.dial}).`,
    };
  }

  // Strictly enforce 10-digit validation for India
  if (country.code === "IN") {
    let digits = input.replace(/\D/g, "");
    if (input.startsWith("+91") || (input.startsWith("+") && digits.startsWith("91"))) {
      digits = digits.slice(2);
    } else if (digits.length === 12 && digits.startsWith("91")) {
      digits = digits.slice(2);
    }
    if (digits.length !== 10) {
      return {
        valid: false,
        error: "invalid_phone",
        message: "Enter a valid India phone number (10 digits after +91).",
      };
    }
    if (!/^[6-9]/.test(digits)) {
      return {
        valid: false,
        error: "invalid_phone",
        message: "Indian phone numbers (10 digits after +91) must start with 6, 7, 8, or 9.",
      };
    }
    return { valid: true, e164: `+91${digits}`, countryCode: "IN" };
  }

  // Strictly enforce 8-digit validation for Singapore
  if (country.code === "SG") {
    let digits = input.replace(/\D/g, "");
    if (input.startsWith("+65") || (input.startsWith("+") && digits.startsWith("65"))) {
      digits = digits.slice(2);
    } else if (digits.length === 10 && digits.startsWith("65")) {
      digits = digits.slice(2);
    }
    if (digits.length !== 8) {
      return {
        valid: false,
        error: "invalid_phone",
        message: "Enter a valid Singapore phone number (8 digits after +65).",
      };
    }
    return { valid: true, e164: `+65${digits}`, countryCode: "SG" };
  }

  try {
    const phone = parsePhoneNumberFromString(input, country.code as CountryCode);
    if (!phone || phone.country !== country.code || !phone.isValid()) {
      return {
        valid: false,
        error: "invalid_phone",
        message: `Enter a valid ${country.name} phone number (${country.localFormat} after ${country.dial}).`,
      };
    }
    return { valid: true, e164: phone.number, countryCode: country.code };
  } catch {
    return {
      valid: false,
      error: "invalid_phone",
      message: `Enter a valid ${country.name} phone number (${country.localFormat} after ${country.dial}).`,
    };
  }
}

export function normalizePatientEmail(emailInput: string): string | null {
  if (typeof emailInput !== "string") return null;
  const email = emailInput.trim().toLowerCase();
  return z.string().email().max(254).safeParse(email).success ? email : null;
}

export type PasswordRequirementError =
  | "required"
  | "first_capital"
  | "lowercase"
  | "number"
  | "symbol"
  | "min_length";

export interface PasswordRequirementsStatus {
  firstCapital: boolean;
  lowercase: boolean;
  number: boolean;
  symbol: boolean;
  minLength: boolean;
  allValid: boolean;
}

export function checkPasswordRequirements(password: unknown): PasswordRequirementsStatus {
  const str = typeof password === "string" ? password : "";
  const firstCapital = /^[A-Z]/.test(str);
  const lowercase = /[a-z]/.test(str);
  const number = /[0-9]/.test(str);
  const symbol = /[^A-Za-z0-9\s]/.test(str);
  const minLength = str.length >= 6;
  const allValid = firstCapital && lowercase && number && symbol && minLength;

  return {
    firstCapital,
    lowercase,
    number,
    symbol,
    minLength,
    allValid,
  };
}

export type PasswordValidationResult =
  | {
      valid: true;
      status: PasswordRequirementsStatus;
    }
  | {
      valid: false;
      error: PasswordRequirementError;
      message: string;
      status: PasswordRequirementsStatus;
    };

export function validatePatientPassword(password: unknown): PasswordValidationResult {
  const str = typeof password === "string" ? password : "";
  const status = checkPasswordRequirements(str);

  if (!str) {
    return {
      valid: false,
      error: "required",
      message: "Password is required.",
      status,
    };
  }

  if (!status.minLength) {
    return {
      valid: false,
      error: "min_length",
      message: "Password must be at least 6 characters long.",
      status,
    };
  }

  if (!status.firstCapital) {
    return {
      valid: false,
      error: "first_capital",
      message: "Password must start with a capital letter (A-Z).",
      status,
    };
  }

  if (!status.lowercase) {
    return {
      valid: false,
      error: "lowercase",
      message: "Password must contain small letters (a-z).",
      status,
    };
  }

  if (!status.number) {
    return {
      valid: false,
      error: "number",
      message: "Password must contain numbers (0-9).",
      status,
    };
  }

  if (!status.symbol) {
    return {
      valid: false,
      error: "symbol",
      message: "Password must contain at least one symbol (e.g. @, #, $, %, etc.).",
      status,
    };
  }

  return {
    valid: true,
    status,
  };
}

