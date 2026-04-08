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
import { API_ERROR_CODES, API_SUCCESS_CODES } from '../../common/constants/apiResponses';

export const createUser = async (req: Request, res: Response) => {
  const user = await createUserService(req.body);

  return sendSuccess(res, user, API_SUCCESS_CODES.USER_CREATED, 201);
};

export const getMe = async (req: Request, res: Response) => {
  const user = await findUserById(req.user!.id);

  if (!user) {
    throw new AppError(API_ERROR_CODES.USER_NOT_FOUND, 404);
  }

  return sendSuccess(res, user, API_SUCCESS_CODES.USER_FETCHED);
};

export const updateMe = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const user = await updateUserProfileService(userId, req.body);

  return sendSuccess(res, user, API_SUCCESS_CODES.USER_PROFILE_UPDATED);
};

export const generateProfilePicturePresigned = async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { fileName } = generateProfilePicturePresignedSchema.parse(req.body);
  const upload = await generateProfilePicturePresignedUrl(userId, fileName);

  return sendSuccess(res, upload, API_SUCCESS_CODES.PROFILE_PICTURE_UPLOAD_URL_GENERATED);
};
