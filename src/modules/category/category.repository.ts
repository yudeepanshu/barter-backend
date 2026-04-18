import prisma from '../../config/db';
import { CreateCategoryInput, UpdateCategoryInput } from './category.schema';

export const createCategory = async (data: CreateCategoryInput) => {
  return prisma.category.create({
    data: {
      name: data.name,
      parentCategoryId: data.parentCategoryId,
    },
    include: { children: true },
  });
};

export const findCategoryById = async (id: string) => {
  return prisma.category.findUnique({
    where: { id },
    include: { children: true, parentCategory: true, products: true },
  });
};

export const findAllCategories = async () => {
  return prisma.category.findMany({
    select: {
      id: true,
      name: true,
      parentCategoryId: true,
    },
    orderBy: { name: 'asc' },
  });
};

export const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  return prisma.category.update({
    where: { id },
    data: {
      name: data.name,
      parentCategoryId: data.parentCategoryId,
    },
    include: { children: true, parentCategory: true },
  });
};

export const deleteCategory = async (id: string) => {
  return prisma.category.delete({
    where: { id },
  });
};

export const findCategoryByName = async (name: string) => {
  return prisma.category.findUnique({
    where: { name },
  });
};
