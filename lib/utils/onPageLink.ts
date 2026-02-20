import { parseKeyToParentFilters } from '@/lib/utils/treeUtils';
import { mapNetworkToUtmSourceFilters } from '@/lib/utils/networkMapping';
import { formatLocalDate } from '@/lib/types/api';
import type { TableFilter } from '@/types/filters';

/**
 * Dimension mapping from marketing report → session analysis filter fields.
 * The on-page analysis page uses the session store, which uses entry-prefixed
 * dimension IDs. Campaign/adset/ad pass names directly — the session query
 * builder supports name-based matching via marketing_merged_ads_spending subqueries.
 */
const DIMENSION_TO_FILTER_FIELD: Record<string, string> = {
  campaign: 'entryCampaign',
  adset: 'entryAdset',
  ad: 'entryAd',
  classifiedCountry: 'entryCountryCode',
};

/**
 * Builds an on-page analysis URL from a marketing report row context.
 * Maps marketing dimensions to session filter fields so clicking a row
 * in the marketing report opens on-page analytics for that traffic segment.
 */
export function buildOnPageUrl(params: {
  dateRange: { start: Date; end: Date };
  dimensions: string[];
  rowKey: string;
}): string {
  const { dateRange, dimensions, rowKey } = params;

  // Parse composite key into dimension→value map
  // e.g., "Google Ads::Campaign1::AdSet1" → { network: "Google Ads", campaign: "Campaign1", adset: "AdSet1" }
  const parentFilters = parseKeyToParentFilters(rowKey, dimensions);

  const filters: TableFilter[] = [];
  let filterStart = dateRange.start;
  let filterEnd = dateRange.end;

  for (const [dimId, value] of Object.entries(parentFilters)) {
    if (value === 'Unknown') continue;

    if (dimId === 'network') {
      // Map network names to entryUtmSource filters (entry-prefixed for session store)
      const sourceFilters = mapNetworkToUtmSourceFilters(value);
      filters.push(...sourceFilters.map(f => ({ ...f, field: 'entryUtmSource' })));
      continue;
    }

    if (dimId === 'date') {
      // Use the date value as both start and end
      const dateVal = new Date(value);
      if (!isNaN(dateVal.getTime())) {
        filterStart = dateVal;
        filterEnd = dateVal;
      }
      continue;
    }

    const filterField = DIMENSION_TO_FILTER_FIELD[dimId];
    if (filterField) {
      filters.push({
        id: `mkt-${filters.length}`,
        field: filterField,
        operator: 'equals',
        value,
      });
    }
  }

  // Build URL params
  const urlParams = new URLSearchParams();
  urlParams.set('start', formatLocalDate(filterStart));
  urlParams.set('end', formatLocalDate(filterEnd));
  urlParams.set('dimensions', 'entryUrlPath');

  if (filters.length > 0) {
    const serialized = JSON.stringify(
      filters.map(({ field, operator, value }) => ({ field, operator, value }))
    );
    urlParams.set('filters', serialized);
  }

  return `/on-page-analysis?${urlParams.toString()}`;
}
