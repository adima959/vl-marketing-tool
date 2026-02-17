import type { DimensionGroupConfig } from '@/types/dimensions';

/**
 * Dashboard dimension configuration.
 * Maps to SalesDimension IDs from types/sales.ts.
 */
export const DASHBOARD_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'orders',
    label: 'Sales Dimensions',
    dimensions: [
      { id: 'country', label: 'Country', group: 'orders' },
      { id: 'productGroup', label: 'Product Name', group: 'orders' },
      { id: 'product', label: 'Product', group: 'orders' },
      { id: 'source', label: 'Source', group: 'orders' },
    ],
  },
];

export const ALL_DASHBOARD_DIMENSIONS = DASHBOARD_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export function getDashboardDimensionLabel(id: string): string {
  const dim = ALL_DASHBOARD_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
}
