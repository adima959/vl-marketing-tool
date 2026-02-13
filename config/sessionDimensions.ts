import type { DimensionGroupConfig } from '@/types';

export const SESSION_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'content',
    label: 'Content',
    dimensions: [
      { id: 'entryUrlPath', label: 'Entry URL', group: 'content' },
      { id: 'entryPageType', label: 'Entry Page Type', group: 'content' },
    ],
  },
  {
    id: 'source',
    label: 'Source',
    dimensions: [
      { id: 'entryUtmSource', label: 'Source', group: 'source' },
      { id: 'entryCampaign', label: 'Campaign', group: 'source' },
      { id: 'entryAdset', label: 'Ad Set', group: 'source' },
      { id: 'entryAd', label: 'Ad', group: 'source' },
      { id: 'entryUtmTerm', label: 'UTM Term', group: 'source' },
      { id: 'entryKeyword', label: 'Keyword', group: 'source' },
      { id: 'entryPlacement', label: 'Placement', group: 'source' },
      { id: 'entryReferrer', label: 'Referrer', group: 'source' },
      { id: 'funnelId', label: 'FF Funnel ID', group: 'source' },
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
      { id: 'visitNumber', label: 'Visit Number', group: 'audience' },
    ],
  },
  {
    id: 'funnel',
    label: 'Funnel',
    dimensions: [
      { id: 'funnelStep', label: 'Funnel Steps', group: 'funnel' },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    dimensions: [
      { id: 'date', label: 'Date', group: 'time' },
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
