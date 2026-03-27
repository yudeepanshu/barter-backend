import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import { createUserService } from './user.service';
import { findUserById } from './user.repository';
import { AppError } from '../../common/errors/AppError';

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
