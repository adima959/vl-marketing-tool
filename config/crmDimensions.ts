import type { DimensionGroupConfig } from '@/types';

/**
 * CRM Geography Dimensions
 * Used by Dashboard for drilling down into subscription/order data
 * by country, product hierarchy, and traffic source
 */
export const CRM_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'orders',
    label: 'CRM Dimensions',
    dimensions: [
      { id: 'country', label: 'Country', group: 'orders' },
      { id: 'productName', label: 'Product Name', group: 'orders' },
      { id: 'product', label: 'Product', group: 'orders' },
      { id: 'source', label: 'Source', group: 'orders' },
    ],
  },
];

export const ALL_CRM_DIMENSIONS = CRM_DIMENSION_GROUPS.flatMap((g) => g.dimensions);

export const getCrmDimensionLabel = (id: string): string => {
  const dim = ALL_CRM_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};

// Backward compatibility exports (deprecated - use CRM_* exports)
export const DASHBOARD_DIMENSION_GROUPS = CRM_DIMENSION_GROUPS;
export const ALL_DASHBOARD_DIMENSIONS = ALL_CRM_DIMENSIONS;
export const getDashboardDimensionLabel = getCrmDimensionLabel;
