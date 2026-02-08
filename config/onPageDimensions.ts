import type { DimensionGroupConfig } from '@/types';

export const ON_PAGE_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'pages',
    label: 'Pages',
    dimensions: [
      { id: 'urlPath', label: 'URL', group: 'pages' },
      { id: 'pageType', label: 'Page Type', group: 'pages' },
      { id: 'classifiedProduct', label: 'Product', group: 'pages' },
      { id: 'classifiedCountry', label: 'Market', group: 'pages' },
    ],
  },
  {
    id: 'advertising',
    label: 'Advertising',
    dimensions: [
      { id: 'utmSource', label: 'Source', group: 'advertising' },
      { id: 'campaign', label: 'Campaign', group: 'advertising' },
      { id: 'adset', label: 'Ad Set', group: 'advertising' },
      { id: 'ad', label: 'Ad', group: 'advertising' },
      { id: 'webmasterId', label: 'Webmaster ID', group: 'advertising' },
      { id: 'funnelId', label: 'FF Funnel ID', group: 'advertising' },
      { id: 'utmTerm', label: 'UTM Term', group: 'advertising' },
    ],
  },
  {
    id: 'visitor',
    label: 'Visitor',
    dimensions: [
      { id: 'countryCode', label: 'Country', group: 'visitor' },
      { id: 'deviceType', label: 'Device', group: 'visitor' },
      { id: 'osName', label: 'OS', group: 'visitor' },
      { id: 'browserName', label: 'Browser', group: 'visitor' },
      { id: 'timezone', label: 'Timezone', group: 'visitor' },
      { id: 'visitNumber', label: 'Visit Number', group: 'visitor' },
    ],
  },
  {
    id: 'general',
    label: 'Time',
    dimensions: [
      { id: 'date', label: 'Date', group: 'general' },
      { id: 'localHour', label: 'Hour of Day', group: 'general' },
    ],
  },
];

export const ALL_ON_PAGE_DIMENSIONS = ON_PAGE_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export const getOnPageDimensionLabel = (id: string): string => {
  const dim = ALL_ON_PAGE_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};
