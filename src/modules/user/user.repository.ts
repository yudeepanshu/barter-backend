import prisma from '../../config/db';
import { PrismaClient } from '@prisma/client';

export const findUserByEmailOrPhone = async (email?: string, mobile?: string) => {
  return prisma.user.findFirst({
    where: {
      OR: [{ email }, { mobileNumber: mobile }],
    },
  });
};

export const createUserTx = async (
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  data: any,
) => {
  return tx.user.create({
    data: {
      userName: data.userName,
      email: data.email,
      mobileNumber: data.mobileNumber,
      profilePicture: data.profilePicture,

      contactPreference: {
        create: {
          allowPhone: data.allowPhone,
          allowEmail: data.allowEmail,
        },
      },
    },
    include: { contactPreference: true },
  });
};
