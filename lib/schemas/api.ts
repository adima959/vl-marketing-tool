import { z } from 'zod';

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
  start: z.string().datetime({ message: 'start must be a valid ISO date string' }),
  end: z.string().datetime({ message: 'end must be a valid ISO date string' }),
}).refine(
  (data) => new Date(data.start) <= new Date(data.end),
  { message: 'start date must be before or equal to end date' }
);

/**
 * Sort direction schema - only allows ASC or DESC
 */
const sortDirectionSchema = z.enum(['ASC', 'DESC']);

/**
 * Common query request schema
 * Used by dashboard, marketing, and on-page analysis APIs
 */
export const queryRequestSchema = z.object({
  dateRange: dateRangeSchema,
  dimensions: z.array(z.string()).min(1, 'dimensions array must contain at least one dimension'),
  depth: z.number().int().min(0, 'depth must be a non-negative integer'),
  parentFilters: z.record(z.string(), z.string()).optional(),
  sortBy: z.string().optional(),
  sortDirection: sortDirectionSchema.optional(),
});

/**
 * Marketing query request schema (extends base with productFilter)
 */
export const marketingQueryRequestSchema = queryRequestSchema.extend({
  productFilter: z.string().optional(),
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
 * Dashboard details request schema
 * For fetching individual detail records
 */
export const dashboardDetailsRequestSchema = z.object({
  metricId: z.enum(['customers', 'subscriptions', 'trials', 'trialsApproved', 'upsells']),
  filters: z.object({
    dateRange: dateRangeSchema,
    country: z.string().optional(),
    product: z.string().optional(),
    source: z.string().optional(),
  }),
  pagination: z.object({
    page: z.number().int().min(1, 'page must be at least 1').default(1),
    pageSize: z.number().int().min(1).max(100, 'pageSize must be between 1 and 100').default(50),
  }).optional(),
});

/**
 * Type inference helpers
 * These provide TypeScript types from the schemas
 */
export type QueryRequest = z.infer<typeof queryRequestSchema>;
export type MarketingQueryRequest = z.infer<typeof marketingQueryRequestSchema>;
export type ApprovalRateQueryRequest = z.infer<typeof approvalRateQueryRequestSchema>;
export type DashboardDetailsRequest = z.infer<typeof dashboardDetailsRequestSchema>;

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
