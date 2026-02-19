import type { TableFilter } from '@/types/filters';

/**
 * Maps marketing report network names to their corresponding utm_source values.
 * Each network may have multiple source variants (e.g., Google uses "google" and "adwords").
 * Multiple same-field equals filters are OR'd together by the on-page query builder.
 */
const NETWORK_TO_SOURCES: Record<string, string[]> = {
  'Google Ads': ['adwords'],
  'Facebook': ['facebook', 'meta'],
  'Meta': ['facebook', 'meta'],
  'Snapchat Ads': ['snapchat'],
  'TikTok Ads': ['tiktok'],
  'Bing Ads': ['bing'],
  'Microsoft Ads': ['bing'],
};

/**
 * Reverse mapping: CRM source name (title-cased) → marketing network name.
 * Built by inverting NETWORK_TO_SOURCES. Uses the first network for each source.
 */
const SOURCE_TO_NETWORK: Record<string, string> = {};
for (const [network, sources] of Object.entries(NETWORK_TO_SOURCES)) {
  for (const source of sources) {
    // Title-case the source to match CRM SaleRow.source normalization
    const titleCased = source.charAt(0).toUpperCase() + source.slice(1);
    if (!SOURCE_TO_NETWORK[titleCased]) {
      SOURCE_TO_NETWORK[titleCased] = network;
    }
  }
}

/**
 * Maps a CRM source name (e.g., "Adwords", "Facebook") to a marketing network name
 * (e.g., "Google Ads", "Facebook"). Returns the original source if no mapping exists.
 */
export function mapCrmSourceToNetwork(source: string): string {
  return SOURCE_TO_NETWORK[source] ?? source;
}

/**
 * Converts a marketing network name to on-page utmSource table filters.
 * Known networks produce exact equals filters; unknown networks use contains
 * with the lowercased name stripped of "ads" suffix.
 */
export function mapNetworkToUtmSourceFilters(network: string): TableFilter[] {
  const sources = NETWORK_TO_SOURCES[network];

  if (sources) {
    return sources.map((source, i) => ({
      id: `net-${i}`,
      field: 'utmSource',
      operator: 'equals' as const,
      value: source,
    }));
  }

  // Fallback: strip "Ads" suffix and lowercase
  const simplified = network.replace(/\s*ads?\s*$/i, '').toLowerCase().trim();
  return [{
    id: 'net-0',
    field: 'utmSource',
    operator: 'contains' as const,
    value: simplified,
  }];
}
