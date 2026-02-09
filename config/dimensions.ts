import type { DimensionGroupConfig } from '@/types';

export const DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'advertising',
    label: 'Advertising',
    dimensions: [
      { id: 'network', label: 'Network', group: 'advertising' },
      { id: 'campaign', label: 'Campaign', group: 'advertising' },
      { id: 'adset', label: 'Ad Set', group: 'advertising' },
      { id: 'ad', label: 'Ad', group: 'advertising' },
      { id: 'date', label: 'Date', group: 'advertising' },
    ],
  },
  {
    id: 'classification',
    label: 'Classification',
    dimensions: [
      { id: 'classifiedProduct', label: 'Product', group: 'classification' },
      { id: 'classifiedCountry', label: 'Market', group: 'classification' },
    ],
  },
];

export const ALL_DIMENSIONS = DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export const getDimensionLabel = (id: string): string => {
  const dim = ALL_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};
