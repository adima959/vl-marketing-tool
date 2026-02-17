import { z } from 'zod';

// Product schemas
export const createProductSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  sku: z.string().max(100).nullish(),
  description: z.string().nullish(),
  notes: z.string().nullish(),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format').nullish(),
  status: z.enum(['active', 'inactive']).optional(),
  ownerId: z.string().uuid('Invalid owner ID').nullish(),
  driveFolderId: z.string().max(255).nullish(),
});

export const updateProductSchema = createProductSchema.partial();

// Campaign schemas
export const createCampaignSchema = z.object({
  messageId: z.string().uuid('Invalid message ID'),
  name: z.string().nullish(),
  channel: z.enum(['meta', 'google', 'taboola', 'other']),
  geo: z.enum(['NO', 'SE', 'DK']),
  externalId: z.string().nullish(),
  externalUrl: z.string().url('Invalid URL').nullish(),
});

export const updateCampaignSchema = z.object({
  channel: z.enum(['meta', 'google', 'taboola', 'other']).optional(),
  geo: z.enum(['NO', 'SE', 'DK']).optional(),
  externalId: z.string().nullish(),
  externalUrl: z.string().url('Invalid URL').nullish(),
  status: z.string().nullish(),
  spend: z.number().nonnegative('Spend must be non-negative').nullish(),
  conversions: z.number().int().nonnegative('Conversions must be non-negative').nullish(),
  cpa: z.number().nonnegative('CPA must be non-negative').nullish(),
});

// Pipeline message schemas
export const createPipelineMessageSchema = z.object({
  angleId: z.string().uuid('Invalid angle ID'),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().nullish(),
  pipelineStage: z.enum(['backlog', 'production', 'testing', 'scaling', 'retired']).optional(),
});

export const updatePipelineMessageSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255).optional(),
  description: z.string().nullish(),
  angleId: z.string().uuid('Invalid angle ID').optional(),
  specificPainPoint: z.string().nullish(),
  corePromise: z.string().nullish(),
  keyIdea: z.string().nullish(),
  primaryHookDirection: z.string().nullish(),
  headlines: z.array(z.string()).optional(),
  status: z.string().nullish(),
  pipelineStage: z.enum(['backlog', 'production', 'testing', 'scaling', 'retired']).optional(),
  verdictType: z.enum(['kill', 'iterate', 'scale', 'expand']).optional(),
  verdictNotes: z.string().nullish(),
  spendThreshold: z.number().nonnegative('Spend threshold must be non-negative').nullish(),
  notes: z.string().nullish(),
});

// Pipeline angle schemas
export const createPipelineAngleSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().nullish(),
});

export const updatePipelineAngleSchema = z.object({
  productId: z.string().uuid('Invalid product ID').optional(),
  name: z.string().min(1, 'Name is required').max(255).optional(),
  description: z.string().nullish(),
});

// Type exports for use in route handlers
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type CreatePipelineMessageInput = z.infer<typeof createPipelineMessageSchema>;
export type UpdatePipelineMessageInput = z.infer<typeof updatePipelineMessageSchema>;
export type CreatePipelineAngleInput = z.infer<typeof createPipelineAngleSchema>;
export type UpdatePipelineAngleInput = z.infer<typeof updatePipelineAngleSchema>;
