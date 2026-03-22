import { z } from 'zod';

export const createUserSchema = z.object({
  userName: z.string().min(3),
  mobileNumber: z.string().min(10).max(15).optional(),
  email: z.email().optional(),
  profilePicture: z.url().optional(),

  allowPhone: z.boolean().default(false),
  allowEmail: z.boolean().default(false),
});
