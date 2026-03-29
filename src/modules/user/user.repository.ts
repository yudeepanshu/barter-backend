import prisma from '../../config/db';
import { PrismaClient } from '@prisma/client';

export const findUserById = async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      userName: true,
      email: true,
      mobileNumber: true,
      profilePicture: true,
    },
  });
};

export const findUserByEmailOrPhone = async (email?: string, mobile?: string) => {
  return prisma.user.findFirst({
    where: {
      OR: [{ email }, { mobileNumber: mobile }],
    },
  });
};

export const findUserByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
};

export const findUserByMobile = async (mobileNumber: string) => {
  return prisma.user.findUnique({
    where: { mobileNumber },
    select: { id: true },
  });
};

export const updateUserById = async (
  id: string,
  data: {
    userName?: string;
    email?: string | null;
    mobileNumber?: string | null;
    profilePicture?: string | null;
  },
) => {
  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      userName: true,
      email: true,
      mobileNumber: true,
      profilePicture: true,
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
