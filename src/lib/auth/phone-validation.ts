/**
 * Phone Number Validation & E.164 Indian Normalization Utilities
 * Complies with Indian Telecom standards: +91 followed by 10-digit mobile (starting with 6-9).
 */

const INDIAN_MOBILE_REGEX = /^(?:\+91|91)?[6-9]\d{9}$/;

/**
 * Validates whether an input string is a valid Indian mobile number.
 * Accepts: "+919876543210", "9876543210", "919876543210", " 98765 43210 "
 */
export function isValidIndianPhone(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return INDIAN_MOBILE_REGEX.test(cleaned);
}

/**
 * Normalizes any valid Indian phone number into standard E.164 format: +91XXXXXXXXXX.
 * Throws an Error if the phone number is invalid.
 */
export function formatToE164(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  
  if (!INDIAN_MOBILE_REGEX.test(cleaned)) {
    throw new Error(
      `Invalid Indian phone number: "${phone}". Must be a 10-digit mobile starting with 6-9.`
    );
  }

  // If already starts with +91, return cleaned
  if (cleaned.startsWith("+91")) {
    return cleaned;
  }

  // If starts with 91 and has 12 digits
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return `+${cleaned}`;
  }

  // 10 digits
  return `+91${cleaned}`;
}

/**
 * Formats an E.164 Indian number for human-readable display: +91 98765 43210
 */
export function formatDisplayPhone(e164Phone: string): string {
  if (!e164Phone || e164Phone.length !== 13 || !e164Phone.startsWith("+91")) {
    return e164Phone;
  }
  const part1 = e164Phone.slice(0, 3); // +91
  const part2 = e164Phone.slice(3, 8); // 98765
  const part3 = e164Phone.slice(8);    // 43210
  return `${part1} ${part2} ${part3}`;
}

/**
 * Strips formatting to return only the 10 local digits.
 */
export function extractLocal10Digits(phone: string): string {
  const e164 = formatToE164(phone);
  return e164.slice(3);
}
