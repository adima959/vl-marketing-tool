import type { DimensionGroupConfig } from '@/types';

/**
 * Approval Rate Report Dimensions
 *
 * These dimensions are available for the approval rate pivot table.
 * Data comes from MariaDB CRM database.
 *
 * Default dimensions: ['country', 'source']
 */

export const APPROVAL_RATE_DIMENSION_GROUPS: DimensionGroupConfig[] = [
  {
    id: 'crm',
    label: 'CRM',
    dimensions: [
      { id: 'country', label: 'Country', group: 'crm' },
      { id: 'source', label: 'Source', group: 'crm' },
      { id: 'product', label: 'Product', group: 'crm' },
    ],
  },
];

export const ALL_APPROVAL_RATE_DIMENSIONS = APPROVAL_RATE_DIMENSION_GROUPS.flatMap(
  (g) => g.dimensions
);

export const getApprovalRateDimensionLabel = (id: string): string => {
  const dim = ALL_APPROVAL_RATE_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};

// Default dimensions for the approval rate report
export const DEFAULT_APPROVAL_RATE_DIMENSIONS = ['source', 'country', 'product'];

/**
 * Database column mapping for each dimension
 * Used in SQL query building (MariaDB)
 *
 * IMPORTANT: Must match dashboardQueryBuilder.ts mappings:
 * - country: c.country (via subscription.customer_id → customer)
 * - product: p.product_name (via invoice_product → product)
 * - source: sr.source (via subscription.source_id → source)
 */
export const APPROVAL_RATE_DIMENSION_COLUMN_MAP: Record<string, string> = {
  country: 'c.country',
  source: 'sr.source',
  product: 'p.product_name',
};

/**
 * Get the SQL column expression for a dimension
 */
export function getDimensionColumn(dimensionId: string): string | undefined {
  return APPROVAL_RATE_DIMENSION_COLUMN_MAP[dimensionId];
}
