import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import { API_SUCCESS_CODES } from '../../common/constants/apiResponses';
import * as categoryService from './category.service';
import {
  CreateCategoryInput,
  createCategorySchema,
  UpdateCategoryInput,
  updateCategorySchema,
} from './category.schema';

export const createCategory = async (req: Request, res: Response) => {
  const payload = createCategorySchema.parse(req.body) as CreateCategoryInput;
  const category = await categoryService.createCategory(payload);
  return sendSuccess(res, category, API_SUCCESS_CODES.CATEGORY_CREATED, 201);
};

export const getCategories = async (req: Request, res: Response) => {
  const categories = await categoryService.getAllCategories();
  return sendSuccess(res, categories);
};

export const getCategory = async (req: Request, res: Response) => {
  const categoryId = req.params.id;
  const category = await categoryService.getCategoryById(categoryId);
  return sendSuccess(res, category);
};

export const updateCategory = async (req: Request, res: Response) => {
  const categoryId = req.params.id;
  const payload = updateCategorySchema.parse(req.body) as UpdateCategoryInput;
  const category = await categoryService.updateCategory(categoryId, payload);
  return sendSuccess(res, category, API_SUCCESS_CODES.CATEGORY_UPDATED);
};

export const deleteCategory = async (req: Request, res: Response) => {
  const categoryId = req.params.id;
  await categoryService.deleteCategory(categoryId);
  return sendSuccess(res, null, API_SUCCESS_CODES.CATEGORY_DELETED);
};
