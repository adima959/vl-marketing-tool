import type { DimensionGroupConfig } from '@/types';

export const SESSION_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'content',
    label: 'Content',
    dimensions: [
      { id: 'entryUrlPath', label: 'Entry URL', group: 'content' },
      { id: 'entryPageType', label: 'Page Type', group: 'content' },
      { id: 'entryProduct', label: 'Product', group: 'content' },
      { id: 'funnelStep', label: 'Funnel Steps', group: 'content' },
    ],
  },
  {
    id: 'trafficSource',
    label: 'Traffic Source',
    dimensions: [
      { id: 'entryUtmSource', label: 'Source', group: 'trafficSource' },
      { id: 'entryCampaign', label: 'Campaign', group: 'trafficSource' },
      { id: 'entryAdset', label: 'Ad Set', group: 'trafficSource' },
      { id: 'entryAd', label: 'Ad', group: 'trafficSource' },
      { id: 'entryWebmasterId', label: 'Webmaster ID', group: 'trafficSource' },
      { id: 'entryUtmTerm', label: 'UTM Term', group: 'trafficSource' },
      { id: 'entryKeyword', label: 'Keyword', group: 'trafficSource' },
      { id: 'entryPlacement', label: 'Placement', group: 'trafficSource' },
      { id: 'entryReferrer', label: 'Referrer', group: 'trafficSource' },
      { id: 'funnelId', label: 'FF Funnel ID', group: 'trafficSource' },
    ],
  },
  {
    id: 'audience',
    label: 'Audience',
    dimensions: [
      { id: 'entryCountryCode', label: 'Country', group: 'audience' },
      { id: 'entryDeviceType', label: 'Device', group: 'audience' },
      { id: 'entryOsName', label: 'OS', group: 'audience' },
      { id: 'entryBrowserName', label: 'Browser', group: 'audience' },
      { id: 'entryBotScore', label: 'Bot Score', group: 'audience' },
      { id: 'visitNumber', label: 'Visit Number', group: 'audience' },
      { id: 'date', label: 'Date', group: 'audience' },
    ],
  },
];

export const ALL_SESSION_DIMENSIONS = SESSION_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

/** Lookup record for dimension validation — keys are valid session dimension IDs */
export const SESSION_DIMENSION_VALID_KEYS: Record<string, string> = Object.fromEntries(
  ALL_SESSION_DIMENSIONS.map((d) => [d.id, d.label])
);

export const getSessionDimensionLabel = (id: string): string => {
  const dim = ALL_SESSION_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};
