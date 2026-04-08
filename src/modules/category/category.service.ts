import { AppError } from '../../common/errors/AppError';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';
import * as repo from './category.repository';
import { CreateCategoryInput, UpdateCategoryInput } from './category.schema';

export const createCategory = async (data: CreateCategoryInput) => {
  // Check if name already exists
  const existing = await repo.findCategoryByName(data.name);
  if (existing) {
    throw new AppError(API_ERROR_CODES.CATEGORY_NAME_ALREADY_EXISTS, 409);
  }

  // Validate parent category exists if provided
  if (data.parentCategoryId) {
    const parentCategory = await repo.findCategoryById(data.parentCategoryId);
    if (!parentCategory) {
      throw new AppError(API_ERROR_CODES.PARENT_CATEGORY_NOT_FOUND, 400);
    }
  }

  return repo.createCategory(data);
};

export const getCategoryById = async (id: string) => {
  const category = await repo.findCategoryById(id);
  if (!category) {
    throw new AppError(API_ERROR_CODES.CATEGORY_NOT_FOUND, 404);
  }
  return category;
};

export const getAllCategories = async () => {
  return repo.findAllCategories();
};

export const updateCategory = async (id: string, data: UpdateCategoryInput) => {
  const category = await getCategoryById(id);

  // Check if new name already exists (if name is being changed)
  if (data.name && data.name !== category.name) {
    const existing = await repo.findCategoryByName(data.name);
    if (existing) {
      throw new AppError(API_ERROR_CODES.CATEGORY_NAME_ALREADY_EXISTS, 409);
    }
  }

  // Validate parent category exists if provided
  if (data.parentCategoryId && data.parentCategoryId !== category.parentCategoryId) {
    const parentCategory = await repo.findCategoryById(data.parentCategoryId);
    if (!parentCategory) {
      throw new AppError(API_ERROR_CODES.PARENT_CATEGORY_NOT_FOUND, 400);
    }

    // Prevent circular reference
    if (parentCategory.id === id) {
      throw new AppError(API_ERROR_CODES.CATEGORY_SELF_PARENT, 400);
    }
  }

  return repo.updateCategory(id, data);
};

export const deleteCategory = async (id: string) => {
  const category = await getCategoryById(id);

  // Check if category has products
  if (category.products && category.products.length > 0) {
    throw new AppError(API_ERROR_CODES.CATEGORY_HAS_PRODUCTS, 400);
  }

  // Check if category has child categories
  if (category.children && category.children.length > 0) {
    throw new AppError(API_ERROR_CODES.CATEGORY_HAS_CHILDREN, 400);
  }

  return repo.deleteCategory(id);
};
