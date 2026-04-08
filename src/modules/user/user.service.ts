import prisma from '../../config/db';
import * as repo from './user.repository';
import { AppError } from '../../common/errors/AppError';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { S3BlobStorage } from '../product/senders/s3Storage';
import { config } from '../../config/env';

const storage = new S3BlobStorage();

function extractOwnedProfileStorageKey(url: string, userId: string): string | null {
  const expectedPrefix = `https://${config.STORAGE.S3_BUCKET}.s3.${config.STORAGE.S3_REGION}.amazonaws.com/`;
  if (!url.startsWith(expectedPrefix)) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!key.startsWith(`users/${userId}/profile/`)) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

export const createUserService = async (data: any) => {
  // At least one required
  if (!data.email && !data.mobileNumber) {
    throw new AppError(API_ERROR_CODES.USER_EMAIL_OR_MOBILE_REQUIRED, 400);
  }

  // Check duplicates
  const existing = await repo.findUserByEmailOrPhone(data.email, data.mobileNumber);

  if (existing) {
    throw new AppError(API_ERROR_CODES.USER_ALREADY_EXISTS, 409);
  }

  return prisma.$transaction(
    async (
      tx: Omit<
        PrismaClient,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
      >,
    ) => {
      const user = await repo.createUserTx(tx, data);
      return user;
    },
  );
};

export const updateUserProfileService = async (
  userId: string,
  data: {
    userName?: string;
    email?: string | null;
    mobileNumber?: string | null;
    profilePicture?: string | null;
  },
) => {
  const existingUser = await repo.findUserById(userId);

  if (!existingUser) {
    throw new AppError(API_ERROR_CODES.USER_NOT_FOUND, 404);
  }

  if (data.email !== undefined && data.email !== null) {
    const userWithEmail = await repo.findUserByEmail(data.email);

    if (userWithEmail && userWithEmail.id !== userId) {
      throw new AppError(API_ERROR_CODES.EMAIL_ALREADY_IN_USE, 409);
    }
  }

  if (data.mobileNumber !== undefined && data.mobileNumber !== null) {
    const userWithMobile = await repo.findUserByMobile(data.mobileNumber);

    if (userWithMobile && userWithMobile.id !== userId) {
      throw new AppError(API_ERROR_CODES.MOBILE_ALREADY_IN_USE, 409);
    }
  }

  const previousProfilePicture = existingUser.profilePicture ?? null;
  const nextProfilePicture = data.profilePicture;

  const updatedUser = await repo.updateUserById(userId, data);

  // Best-effort cleanup: when profile picture changes, delete the old file from S3.
  // Never fail profile update if object deletion fails.
  const pictureChanged =
    nextProfilePicture !== undefined && nextProfilePicture !== previousProfilePicture;
  if (pictureChanged && previousProfilePicture) {
    const oldKey = extractOwnedProfileStorageKey(previousProfilePicture, userId);
    if (oldKey) {
      try {
        await storage.deleteFile(oldKey);
      } catch {
        // Swallow cleanup failure intentionally.
      }
    }
  }

  return updatedUser;
};

export const generateProfilePicturePresignedUrl = async (userId: string, fileName: string) => {
  const user = await repo.findUserById(userId);
  if (!user) {
    throw new AppError(API_ERROR_CODES.USER_NOT_FOUND, 404);
  }

  const ext = path.extname(fileName).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    throw new AppError(API_ERROR_CODES.INVALID_FILE_TYPE, 400);
  }

  const mimeTypeByExt: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  const key = `users/${userId}/profile/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const {
    signedUrl,
    publicUrl,
    key: storageKey,
  } = await storage.getPresignedUrl({
    key,
    contentType: mimeTypeByExt[ext],
  });

  return {
    signedUrl,
    publicUrl,
    storageKey,
    fileName,
  };
};
