/**
 * Country code detection from input segments (campaign names, URL paths, etc.)
 */
export const COUNTRY_PATTERNS: Record<string, string> = {
  nor: 'NO', no: 'NO', norway: 'NO',
  dnk: 'DK', dk: 'DK', denmark: 'DK',
  swe: 'SE', sve: 'SE', se: 'SE', sweden: 'SE',
  fin: 'FI', fi: 'FI', finland: 'FI',
};

/**
 * Try to match pre-segmented input to a product + country.
 * Segments should be lowercased and trimmed before passing.
 *
 * Country: matched via COUNTRY_PATTERNS lookup.
 * Product: matched by exact normalized name or prefix (min 3 chars).
 *   Both sides are normalized by stripping hyphens/spaces for comparison,
 *   e.g. segment "sleep-repair" -> "sleeprepair" matches product "SleepRepair".
 *   Also tries consecutive segment pairs/triples to handle compound names
 *   split across segments, e.g. ["t","formula"] -> "tformula" matches "T-Formula".
 *
 * Returns null unless both product and country are detected.
 */
export function matchProductAndCountry(
  segments: string[],
  products: { id: string; name: string }[]
): { productId: string; countryCode: string } | null {
  let countryCode: string | null = null;
  for (const seg of segments) {
    if (COUNTRY_PATTERNS[seg]) {
      countryCode = COUNTRY_PATTERNS[seg];
      break;
    }
  }

  // Build candidate strings: individual segments + consecutive pairs/triples
  // This handles cases like "T-Formula" split into ["t","formula"] → joined "tformula"
  const candidates: string[] = segments.map((s) => s.replace(/-/g, ''));
  for (let i = 0; i < segments.length - 1; i++) {
    candidates.push(segments[i].replace(/-/g, '') + segments[i + 1].replace(/-/g, ''));
    if (i < segments.length - 2) {
      candidates.push(
        segments[i].replace(/-/g, '') + segments[i + 1].replace(/-/g, '') + segments[i + 2].replace(/-/g, '')
      );
    }
  }

  let productId: string | null = null;
  for (const product of products) {
    const productNorm = product.name.toLowerCase().replace(/[-\s]+/g, '');
    for (const candidate of candidates) {
      if (
        candidate === productNorm ||
        (candidate.length >= 3 && productNorm.startsWith(candidate))
      ) {
        productId = product.id;
        break;
      }
    }
    if (productId) break;
  }

  if (countryCode && productId) {
    return { productId, countryCode };
  }
  return null;
}
