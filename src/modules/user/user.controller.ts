import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import {
  createUserService,
  generateProfilePicturePresignedUrl,
  updateUserProfileService,
} from './user.service';
import { findUserById } from './user.repository';
import { AppError } from '../../common/errors/AppError';
import { generateProfilePicturePresignedSchema } from './user.schema';

export const createUser = async (req: Request, res: Response) => {
  const user = await createUserService(req.body);

  return sendSuccess(res, user, 'User created', 201);
};

export const getMe = async (req: Request, res: Response) => {
  const user = await findUserById(req.user!.id as string);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return sendSuccess(res, user, 'User fetched');
};

export const updateMe = async (req: Request, res: Response) => {
  const userId = req.user!.id as string;
  const user = await updateUserProfileService(userId, req.body);

  return sendSuccess(res, user, 'User profile updated');
};

export const generateProfilePicturePresigned = async (req: Request, res: Response) => {
  const userId = req.user!.id as string;
  const { fileName } = generateProfilePicturePresignedSchema.parse(req.body);
  const upload = await generateProfilePicturePresignedUrl(userId, fileName);

  return sendSuccess(res, upload, 'Profile picture upload URL generated');
};
