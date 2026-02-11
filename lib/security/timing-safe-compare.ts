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
  // Handle null/undefined — perform dummy comparison to avoid timing leak
  if (!a || !b) {
    const dummy = Buffer.alloc(32);
    timingSafeEqual(dummy, dummy);
    return false;
  }

  // Pad both to equal length to prevent length-based timing leaks
  const maxLen = Math.max(a.length, b.length);
  const bufA = Buffer.alloc(maxLen);
  const bufB = Buffer.alloc(maxLen);
  bufA.write(a, 'utf8');
  bufB.write(b, 'utf8');

  try {
    // Constant-time comparison, then verify actual lengths match
    return timingSafeEqual(bufA, bufB) && a.length === b.length;
  } catch (error) {
    console.error('[timingSafeCompare] Error:', error);
    return false;
  }
}
