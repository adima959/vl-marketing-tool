import { z } from 'zod';

/** URL schema that only allows http(s) protocols — blocks javascript:, data:, etc. */
const safeUrlSchema = z.string().url('Invalid URL').refine(
  (url: string) => { try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; } },
  { message: 'Only HTTP(S) URLs are allowed' }
);

// Product schemas
export const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  sku: z.string().max(100).nullish(),
  description: z.string().nullish(),
  notes: z.string().nullish(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format').nullish(),
  status: z.enum(['active', 'inactive']).optional(),
  ownerId: z.string().uuid('Invalid owner ID').nullish(),
});

export const updateProductSchema = createProductSchema.partial();

// Angle schemas
export const createAngleSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().nullish(),
  status: z.enum(['idea', 'in_production', 'live', 'paused', 'retired']).optional(),
});

export const updateAngleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255).optional(),
  description: z.string().nullish(),
  status: z.enum(['idea', 'in_production', 'live', 'paused', 'retired']).optional(),
  launchedAt: z.string().nullish(),
});

// Message schemas
export const createMessageSchema = z.object({
  angleId: z.string().uuid('Invalid angle ID'),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().nullish(),
  specificPainPoint: z.string().nullish(),
  corePromise: z.string().nullish(),
  keyIdea: z.string().nullish(),
  primaryHookDirection: z.string().nullish(),
  headlines: z.array(z.string()).optional(),
  status: z.enum(['idea', 'in_production', 'live', 'paused', 'retired']).optional(),
});

export const updateMessageSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255).optional(),
  description: z.string().nullish(),
  status: z.enum(['idea', 'in_production', 'live', 'paused', 'retired']).optional(),
  specificPainPoint: z.string().nullish(),
  corePromise: z.string().nullish(),
  keyIdea: z.string().nullish(),
  primaryHookDirection: z.string().nullish(),
  headlines: z.array(z.string()).optional(),
  launchedAt: z.string().nullish(),
});

// Asset schemas
export const createAssetSchema = z.object({
  messageId: z.string().uuid('Invalid message ID'),
  geo: z.enum(['NO', 'SE', 'DK']),
  type: z.enum(['landing_page', 'text_ad', 'brief', 'research']),
  name: z.string().min(1, 'Name is required').max(255),
  url: safeUrlSchema.nullish(),
  content: z.string().nullish(),
  notes: z.string().nullish(),
});

export const updateAssetSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255).optional(),
  geo: z.enum(['NO', 'SE', 'DK']).optional(),
  type: z.enum(['landing_page', 'text_ad', 'brief', 'research']).optional(),
  url: safeUrlSchema.nullish(),
  content: z.string().nullish(),
  notes: z.string().nullish(),
});

// Creative schemas
export const createCreativeSchema = z.object({
  messageId: z.string().uuid('Invalid message ID'),
  geo: z.enum(['NO', 'SE', 'DK']),
  format: z.enum(['ugc_video', 'static_image', 'video']),
  name: z.string().min(1, 'Name is required').max(255),
  cta: z.string().nullish(),
  url: safeUrlSchema.nullish(),
  notes: z.string().nullish(),
});

export const updateCreativeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255).optional(),
  geo: z.enum(['NO', 'SE', 'DK']).optional(),
  format: z.enum(['ugc_video', 'static_image', 'video']).optional(),
  cta: z.string().nullish(),
  url: safeUrlSchema.nullish(),
  notes: z.string().nullish(),
});

// Restore schema
export const restoreProductSchema = z.object({
  id: z.string().uuid('Invalid product ID').optional(),
  name: z.string().min(1, 'Name is required').optional(),
}).refine(
  (data) => data.id || data.name,
  { message: 'Provide either "id" or "name" in request body' }
);

// Type exports for use in route handlers
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateAngleInput = z.infer<typeof createAngleSchema>;
export type UpdateAngleInput = z.infer<typeof updateAngleSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type CreateCreativeInput = z.infer<typeof createCreativeSchema>;
export type UpdateCreativeInput = z.infer<typeof updateCreativeSchema>;
export type RestoreProductInput = z.infer<typeof restoreProductSchema>;
