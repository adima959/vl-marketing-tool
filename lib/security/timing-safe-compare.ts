import { timingSafeEqual } from 'crypto';

/**
 * Performs a timing-safe string comparison to prevent timing attacks
 *
 * Uses crypto.timingSafeEqual to ensure comparison time is constant
 * regardless of where strings differ, preventing attackers from
 * extracting secrets character-by-character via timing analysis.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 */
export function timingSafeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  // Handle null/undefined cases
  if (!a || !b) {
    return false;
  }

  // Ensure both strings are same length to prevent timing leaks
  // timingSafeEqual requires buffers of equal length
  if (a.length !== b.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    );
  } catch (error) {
    // If buffer creation fails for any reason, safely return false
    console.error('[timingSafeCompare] Error:', error);
    return false;
  }
}
