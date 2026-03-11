/**
 * Advanced Phone Number Validation
 * Uses libphonenumber-js for robust international validation, parsing, and formatting.
 */

import { parsePhoneNumber } from 'libphonenumber-js';

// ============================================================================
// Types
// ============================================================================

export interface PhoneValidationResult {
  /** Whether the phone number is valid */
  isValid: boolean;
  /** Normalized E.164 format (e.g., +1234567890) if valid */
  normalized?: string;
  /** Two-letter country code (e.g., 'US') if valid */
  country?: string;
  /** Human-readable description of the error, if invalid */
  error?: string;
}

export interface PhoneValidationOptions {
  /** Default country code (2-letter ISO) to use when number doesn't have international prefix */
  defaultCountry?: string;
  /** Whether to accept numbers with a WhatsApp JID suffix (@c.us, @s.whatsapp.net, etc.) */
  allowWhatsAppJid?: boolean;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Strip a possible WhatsApp JID suffix like "@c.us", "@s.whatsapp.net", etc.
 * Returns just the numeric phone part.
 */
function stripWhatsAppJid(phone: string): string {
  const atIndex = phone.indexOf('@');
  return atIndex > 0 ? phone.substring(0, atIndex) : phone;
}

/**
 * Determine country code from a WhatsApp JID suffix (if present)
 * Examples: @c.us -> US, @c.uk -> UK, @s.whatsapp.net -> unknown (return undefined)
 */
function countryFromWhatsAppJid(phone: string): string | undefined {
  const atIndex = phone.indexOf('@');
  if (atIndex < 0) return undefined;
  const suffix = phone.substring(atIndex + 1);
  // Map known suffixes: c.us => US, c.uk => UK, c.ca => CA, etc.
  // Format: c.<countryCode> or s.whatsapp.net (no country)
  const parts = suffix.split('.');
  if (parts[0] === 'c' && parts[1]) {
    return parts[1].toUpperCase();
  }
  return undefined;
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate a phone number using libphonenumber-js.
 *
 * Supports:
 * - International format with + prefix
 * - National format (requires defaultCountry)
 * - WhatsApp JIDs (e.g., 1234567890@c.us)
 *
 * @param input - The phone number string to validate
 * @param options - Optional configuration
 * @returns ValidationResult with normalized number and metadata
 */
export function validatePhoneNumber(input: string, options: PhoneValidationOptions = {}): PhoneValidationResult {
  const { defaultCountry, allowWhatsAppJid = true } = options;

  if (!input || typeof input !== 'string') {
    return { isValid: false, error: 'Phone number is required' };
  }

  let phone = input.trim();
  let detectedCountry: string | undefined;

  // Handle WhatsApp JID suffix
  if (allowWhatsAppJid && phone.includes('@')) {
    detectedCountry = countryFromWhatsAppJid(phone);
    phone = stripWhatsAppJid(phone);
  }

  // If input has only digits and starts with 1-9, we can assume it's a valid number pattern.
  // Try parsing with libphonenumber-js.
  try {
    // parsePhoneNumber returns a PhoneNumber object or null
    const parsed = defaultCountry
      ? parsePhoneNumber(phone, defaultCountry as any)
      : parsePhoneNumber(phone);

    if (!parsed) {
      return { isValid: false, error: 'Cannot parse phone number' };
    }

    // Check if the parsed number is valid
    if (!parsed.isValid()) {
      return { isValid: false, error: 'Invalid phone number' };
    }

    // Use PhoneNumber.format with 'E.164' for canonical representation
    const normalized = parsed.format('E.164');

    return {
      isValid: true,
      normalized,
      country: detectedCountry || parsed.country,
    };
  } catch (err) {
    return { isValid: false, error: 'Invalid phone number' };
  }
}

/**
 * Fast path: Check if a phone number is valid according to libphonenumber-js.
 * Returns false if not valid.
 */
export function isValidPhone(input: string, options: PhoneValidationOptions = {}): boolean {
  return validatePhoneNumber(input, options).isValid;
}

/**
 * Normalize a phone number to E.164 format if valid.
 * Throws if invalid.
 */
export function normalizePhoneNumber(input: string, options: PhoneValidationOptions = {}): string {
  const result = validatePhoneNumber(input, options);
  if (!result.isValid || !result.normalized) {
    throw new Error(result.error || 'Invalid phone number');
  }
  return result.normalized;
}
