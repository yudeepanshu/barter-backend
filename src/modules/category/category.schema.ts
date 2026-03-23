import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  parentCategoryId: z.string().uuid().optional().nullable(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentCategoryId: z.string().uuid().optional().nullable(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
