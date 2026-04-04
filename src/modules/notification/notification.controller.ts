import type { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as notificationService from './notification.service';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
  registerPushDeviceSchema,
  unregisterPushDeviceSchema,
} from './notification.schema';

export const registerPushDevice = async (req: Request, res: Response) => {
  const payload = registerPushDeviceSchema.parse(req.body);
  const userId = req.user?.id;
  const result = await notificationService.registerPushDevice(userId, payload);
  return sendSuccess(res, result, 'Push device registered');
};

export const unregisterPushDevice = async (req: Request, res: Response) => {
  const payload = unregisterPushDeviceSchema.parse(req.body);
  const userId = req.user?.id;
  const result = await notificationService.unregisterPushDevice(userId, payload);
  return sendSuccess(res, result, 'Push device unregistered');
};

export const getNotifications = async (req: Request, res: Response) => {
  const query = listNotificationsQuerySchema.parse(req.query);
  const userId = req.user?.id;
  const result = await notificationService.getNotifications(userId, query);
  return sendSuccess(res, result);
};

export const markNotificationRead = async (req: Request, res: Response) => {
  const { id } = notificationIdParamSchema.parse(req.params);
  const userId = req.user?.id;
  const result = await notificationService.markNotificationRead(userId, id);
  return sendSuccess(res, result, 'Notification marked as read');
};

export const markAllNotificationsRead = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const result = await notificationService.markAllNotificationsRead(userId);
  return sendSuccess(res, result, 'All notifications marked as read');
};

export const clearAllNotifications = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const result = await notificationService.clearAllNotifications(userId);
  return sendSuccess(res, result, 'All notifications cleared');
};
