import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import { createUserService } from './user.service';

export const createUser = async (req: Request, res: Response) => {
  const user = await createUserService(req.body);

  return sendSuccess(res, user, 'User created', 201);
};
