import prisma from '../../config/db';
import * as repo from './user.repository';
import { AppError } from '../../common/errors/AppError';
import { PrismaClient } from '@prisma/client';

export const createUserService = async (data: any) => {
  // At least one required
  if (!data.email && !data.mobileNumber) {
    throw new AppError('Email or Mobile is required', 400);
  }

  // Check duplicates
  const existing = await repo.findUserByEmailOrPhone(data.email, data.mobileNumber);

  if (existing) {
    throw new AppError('User already exists', 409);
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
