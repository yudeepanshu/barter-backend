import { z } from 'zod';

export const createUserSchema = z.object({
  // max 50: short enough to display cleanly in UI, long enough for any real name.
  userName: z.string().min(3).max(50),
  mobileNumber: z.string().min(10).max(15).optional(),
  email: z.email().optional(),
  profilePicture: z.url().max(2048).optional(),

  allowPhone: z.boolean().default(false),
  allowEmail: z.boolean().default(false),
});

export const updateUserProfileSchema = z
  .object({
    userName: z.string().min(3).max(50).optional(),
    mobileNumber: z.string().min(10).max(15).nullable().optional(),
    email: z.email().nullable().optional(),
    profilePicture: z.url().max(2048).nullable().optional(),
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
  // 255 chars matches the OS filesystem filename length limit.
  fileName: z.string().min(1).max(255),
});
