import type { DimensionGroupConfig } from '@/types';

/**
 * Marketing Report Dimensions
 * Used by Marketing Report for drilling down into ads data
 * by network, campaign hierarchy, date, and campaign classifications
 */
export const MARKETING_DIMENSION_GROUPS: DimensionGroupConfig[] = [
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
      { id: 'classifiedCountry', label: 'Country', group: 'classification' },
    ],
  },
];

export const ALL_MARKETING_DIMENSIONS = MARKETING_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export const getMarketingDimensionLabel = (id: string): string => {
  const dim = ALL_MARKETING_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};
