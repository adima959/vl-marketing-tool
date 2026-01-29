import type { DimensionGroupConfig } from '@/types';

export const DASHBOARD_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'orders',
    label: 'Order Dimensions',
    dimensions: [
      { id: 'country', label: 'Country', group: 'orders' },
      { id: 'product', label: 'Product', group: 'orders' },
    ],
  },
];

export const ALL_DASHBOARD_DIMENSIONS = DASHBOARD_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export const getDashboardDimensionLabel = (id: string): string => {
  const dim = ALL_DASHBOARD_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};
