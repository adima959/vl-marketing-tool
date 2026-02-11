import type { DimensionGroupConfig } from '@/types';

/**
 * Validation Rate Report Dimensions
 *
 * Shared dimensions for all validation rate pages (approval, pay, buy).
 * Data comes from MariaDB CRM database.
 *
 * Default dimensions: ['country', 'source', 'product']
 */

export const VALIDATION_RATE_DIMENSION_GROUPS: DimensionGroupConfig[] = [
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

export const ALL_VALIDATION_RATE_DIMENSIONS = VALIDATION_RATE_DIMENSION_GROUPS.flatMap(
  (g) => g.dimensions
);

export const getValidationRateDimensionLabel = (id: string): string => {
  const dim = ALL_VALIDATION_RATE_DIMENSIONS.find((d) => d.id === id);
  return dim?.label ?? id;
};

// Default dimensions for all validation rate reports
export const DEFAULT_VALIDATION_RATE_DIMENSIONS = ['country', 'source', 'product'];

/**
 * Database column mapping for each dimension
 * Used in SQL query building (MariaDB)
 *
 * Matches crmQueryBuilder.ts geography mode mappings:
 * - country: c.country (via subscription.customer_id → customer)
 * - source: COALESCE(sr.source, sr_sub.source) — invoice source (primary) → subscription source (fallback)
 * - product: COALESCE(p.product_name, p_sub.product_name) — invoice product (primary) → subscription product (fallback)
 */
export const VALIDATION_RATE_DIMENSION_COLUMN_MAP: Record<string, string> = {
  country: 'c.country',
  source: 'COALESCE(sr.source, sr_sub.source)',
  product: 'COALESCE(p.product_name, p_sub.product_name)',
};

/**
 * Get the SQL column expression for a dimension
 */
export function getValidationRateDimensionColumn(dimensionId: string): string | undefined {
  return VALIDATION_RATE_DIMENSION_COLUMN_MAP[dimensionId];
}
