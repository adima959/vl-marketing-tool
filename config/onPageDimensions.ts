import type { DimensionGroupConfig } from '@/types';

export const ON_PAGE_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'pages',
    label: 'Pages',
    dimensions: [
      { id: 'urlPath', label: 'URL', group: 'pages' },
      { id: 'pageType', label: 'Page Type', group: 'pages' },
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
    ],
  },
  {
    id: 'device',
    label: 'Device',
    dimensions: [
      { id: 'deviceType', label: 'Device', group: 'device' },
      { id: 'osName', label: 'OS', group: 'device' },
      { id: 'browserName', label: 'Browser', group: 'device' },
    ],
  },
  {
    id: 'geo',
    label: 'Geography',
    dimensions: [
      { id: 'countryCode', label: 'Country', group: 'geo' },
    ],
  },
  {
    id: 'general',
    label: 'Time',
    dimensions: [
      { id: 'date', label: 'Date', group: 'general' },
    ],
  },
];

export const ALL_ON_PAGE_DIMENSIONS = ON_PAGE_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export const getOnPageDimensionLabel = (id: string): string => {
  const dim = ALL_ON_PAGE_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};
