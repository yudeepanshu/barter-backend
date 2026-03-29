import { z } from 'zod';

export const createUserSchema = z.object({
  userName: z.string().min(3),
  mobileNumber: z.string().min(10).max(15).optional(),
  email: z.email().optional(),
  profilePicture: z.url().optional(),

  allowPhone: z.boolean().default(false),
  allowEmail: z.boolean().default(false),
});

export const updateUserProfileSchema = z
  .object({
    userName: z.string().min(3).optional(),
    mobileNumber: z.string().min(10).max(15).nullable().optional(),
    email: z.email().nullable().optional(),
    profilePicture: z.url().nullable().optional(),
  })
  .refine(
    (value) =>
      value.userName !== undefined ||
      value.mobileNumber !== undefined ||
      value.email !== undefined ||
      value.profilePicture !== undefined,
    {
      message: 'At least one field is required: userName, email, mobileNumber, or profilePicture',
    },
  );

export const generateProfilePicturePresignedSchema = z.object({
  fileName: z.string().min(1),
});
