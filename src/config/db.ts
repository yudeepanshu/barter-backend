import { PrismaClient } from '@prisma/client';

// Ensure DATABASE_URL is available for Prisma
if (!process.env.PRISMA_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.PRISMA_DATABASE_URL = process.env.DATABASE_URL;
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
