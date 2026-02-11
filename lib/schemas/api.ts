import { z } from 'zod';
import { DASHBOARD_DETAIL_METRIC_IDS, MARKETING_DETAIL_METRIC_IDS } from '@/lib/server/crmMetrics';

/**
 * Zod schemas for API request validation
 *
 * These replace manual validation checks and provide:
 * - Runtime type validation
 * - Better error messages
 * - Type inference for TypeScript
 * - Automatic request parsing
 */

/**
 * Date range schema - validates ISO date strings
 */
const dateRangeSchema = z.object({
  start: z.string().date('start must be a valid YYYY-MM-DD date string'),
  end: z.string().date('end must be a valid YYYY-MM-DD date string'),
}).refine(
  (data) => new Date(data.start) <= new Date(data.end),
  { message: 'start date must be before or equal to end date' }
);

/**
 * Sort direction schema - only allows ASC or DESC
 */
const sortDirectionSchema = z.enum(['ASC', 'DESC']);

/**
 * Table filter schema for dimension-level WHERE clause filters
 */
const filterOperatorSchema = z.enum(['equals', 'not_equals', 'contains', 'not_contains']);

export const tableFilterSchema = z.object({
  field: z.string().min(1),
  operator: filterOperatorSchema,
  value: z.string(),
});

/**
 * Common query request schema
 * Used by dashboard, marketing, and on-page analysis APIs
 */
export const queryRequestSchema = z.object({
  dateRange: dateRangeSchema,
  dimensions: z.array(z.string()).min(1, 'dimensions array must contain at least one dimension'),
  depth: z.number().int().min(0, 'depth must be a non-negative integer'),
  parentFilters: z.record(z.string(), z.string()).optional(),
  filters: z.array(tableFilterSchema).optional(),
  sortBy: z.string().nullish(),
  sortDirection: sortDirectionSchema.optional(),
});

/**
 * Marketing query request schema (extends base with productFilter)
 */
export const marketingQueryRequestSchema = queryRequestSchema.extend({
  productFilter: z.string().nullish(),
});

/**
 * Time period schema for approval rate report
 */
const timePeriodSchema = z.enum(['weekly', 'biweekly', 'monthly']);

/**
 * Approval rate query request schema (extends base with timePeriod)
 */
export const approvalRateQueryRequestSchema = queryRequestSchema.extend({
  timePeriod: timePeriodSchema.default('biweekly'),
});

/**
 * Validation rate type schema
 */
const validationRateTypeSchema = z.enum(['approval', 'pay', 'buy']);

/**
 * Validation rate query request schema (extends base with timePeriod + rateType)
 * Used by all validation rate pages (approval, pay, buy)
 */
export const validationRateQueryRequestSchema = queryRequestSchema.extend({
  timePeriod: timePeriodSchema.default('biweekly'),
  rateType: validationRateTypeSchema,
});

/**
 * Shared pagination schema — reused by all detail request schemas
 */
const paginationSchema = z.object({
  page: z.number().int().min(1, 'page must be at least 1').default(1),
  pageSize: z.number().int().min(1).max(5000, 'pageSize must be between 1 and 5000').default(50),
}).optional();

/**
 * Dashboard details request schema
 * For fetching individual detail records from dashboard drilldown
 */
export const dashboardDetailsRequestSchema = z.object({
  metricId: z.enum([...DASHBOARD_DETAIL_METRIC_IDS]),
  filters: z.object({
    dateRange: dateRangeSchema,
    country: z.string().nullish(),
    product: z.string().nullish(),
    productName: z.string().nullish(),
    source: z.string().nullish(),
    excludeDeleted: z.boolean().optional(),
    excludeUpsellTags: z.boolean().optional(),
    rateType: validationRateTypeSchema.optional(),
  }),
  pagination: paginationSchema,
});

/**
 * Marketing details request schema
 * For fetching individual detail records from marketing report drilldown
 */
export const marketingDetailsRequestSchema = z.object({
  metricId: z.enum([...MARKETING_DETAIL_METRIC_IDS]),
  filters: z.object({
    dateRange: dateRangeSchema,
    network: z.string().nullish(),
    campaign: z.string().nullish(),
    adset: z.string().nullish(),
    ad: z.string().nullish(),
    date: z.string().date().optional(),
    classifiedProduct: z.string().nullish(),
    classifiedCountry: z.string().nullish(),
  }),
  pagination: paginationSchema,
});

/**
 * Saved view schemas
 */
const datePresetSchema = z.enum([
  'today', 'yesterday', 'last7days', 'last14days', 'last30days',
  'last90days', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth',
]);

export const savedViewCreateSchema = z.object({
  name: z.string().min(1).max(100),
  pagePath: z.string().min(1),
  dateMode: z.enum(['relative', 'absolute', 'none']),
  datePreset: datePresetSchema.optional(),
  dateStart: z.string().date().nullish(),
  dateEnd: z.string().date().nullish(),
  dimensions: z.array(z.string()).optional(),
  filters: z.array(tableFilterSchema).optional(),
  sortBy: z.string().nullish(),
  sortDir: z.enum(['ascend', 'descend']).optional(),
  period: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
  visibleColumns: z.array(z.string()).optional(),
}).refine(
  (data) => {
    if (data.dateMode === 'none') return true;
    if (data.dateMode === 'relative') return !!data.datePreset;
    return !!data.dateStart && !!data.dateEnd;
  },
  { message: 'Relative mode requires datePreset; absolute mode requires dateStart and dateEnd' }
);

export const savedViewRenameSchema = z.object({
  name: z.string().min(1).max(100),
});

export const savedViewToggleFavoriteSchema = z.object({
  isFavorite: z.boolean(),
});

export const savedViewReorderSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    favoriteOrder: z.number().int().min(0),
  })).min(1).max(50),
});

/**
 * Type inference helpers
 * These provide TypeScript types from the schemas
 */
export type QueryRequest = z.infer<typeof queryRequestSchema>;
export type MarketingQueryRequest = z.infer<typeof marketingQueryRequestSchema>;
export type ApprovalRateQueryRequest = z.infer<typeof approvalRateQueryRequestSchema>;
export type ValidationRateQueryRequest = z.infer<typeof validationRateQueryRequestSchema>;
export type DashboardDetailsRequest = z.infer<typeof dashboardDetailsRequestSchema>;
export type MarketingDetailsRequest = z.infer<typeof marketingDetailsRequestSchema>;
export type SavedViewCreateRequest = z.infer<typeof savedViewCreateSchema>;
export type SavedViewRenameRequest = z.infer<typeof savedViewRenameSchema>;
export type SavedViewToggleFavoriteRequest = z.infer<typeof savedViewToggleFavoriteSchema>;
export type SavedViewReorderRequest = z.infer<typeof savedViewReorderSchema>;

/**
 * Validation helper function
 * Parses and validates request body with Zod schema
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate (usually request body)
 * @returns Parsed and validated data
 * @throws ZodError if validation fails
 *
 * @example
 * const validatedData = validateRequest(queryRequestSchema, await request.json());
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe validation helper that returns success/error object
 * Use this when you want to handle validation errors manually
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Object with success flag and data or errors
 *
 * @example
 * const result = safeValidateRequest(queryRequestSchema, await request.json());
 * if (!result.success) {
 *   return NextResponse.json({ error: result.error.message }, { status: 400 });
 * }
 * const validData = result.data;
 */
export function safeValidateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
