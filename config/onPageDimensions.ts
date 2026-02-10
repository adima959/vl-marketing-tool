import type { DimensionGroupConfig } from '@/types';

export const ON_PAGE_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'content',
    label: 'Content',
    dimensions: [
      { id: 'urlPath', label: 'URL', group: 'content' },
      { id: 'pageType', label: 'Page Type', group: 'content' },
      { id: 'classifiedProduct', label: 'Product', group: 'content' },
    ],
  },
  {
    id: 'source',
    label: 'Source',
    dimensions: [
      { id: 'utmSource', label: 'Source', group: 'source' },
      { id: 'campaign', label: 'Campaign', group: 'source' },
      { id: 'adset', label: 'Ad Set', group: 'source' },
      { id: 'ad', label: 'Ad', group: 'source' },
      { id: 'utmTerm', label: 'UTM Term', group: 'source' },
      { id: 'keyword', label: 'Keyword', group: 'source' },
      { id: 'placement', label: 'Placement', group: 'source' },
      { id: 'referrer', label: 'Referrer', group: 'source' },
      { id: 'webmasterId', label: 'Webmaster ID', group: 'source' },
      { id: 'funnelId', label: 'FF Funnel ID', group: 'source' },
    ],
  },
  {
    id: 'audience',
    label: 'Audience',
    dimensions: [
      { id: 'countryCode', label: 'Country', group: 'audience' },
      { id: 'deviceType', label: 'Device', group: 'audience' },
      { id: 'osName', label: 'OS', group: 'audience' },
      { id: 'browserName', label: 'Browser', group: 'audience' },
      { id: 'visitNumber', label: 'Visit Number', group: 'audience' },
      { id: 'timezone', label: 'Timezone', group: 'audience' },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    dimensions: [
      { id: 'date', label: 'Date', group: 'time' },
      { id: 'localHour', label: 'Hour of Day', group: 'time' },
    ],
  },
];

export const ALL_ON_PAGE_DIMENSIONS = ON_PAGE_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export const getOnPageDimensionLabel = (id: string): string => {
  const dim = ALL_ON_PAGE_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};
