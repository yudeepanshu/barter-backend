import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as requestService from './request.service';
import { createRequestSchema, listRequestsQuerySchema } from './request.schema';

export const createRequest = async (req: Request, res: Response) => {
  const payload = createRequestSchema.parse(req.body);
  const userId = req.user?.id;
  const result = await requestService.createRequest(payload, userId);
  return sendSuccess(res, result, 'Request created', 201);
};

export const getRequestById = async (req: Request, res: Response) => {
  const requestId = req.params.id;
  const userId = req.user?.id;
  const request = await requestService.getRequestById(requestId, userId);
  return sendSuccess(res, request);
};

export const getSentRequests = async (req: Request, res: Response) => {
  const query = listRequestsQuerySchema.parse(req.query);
  const userId = req.user?.id;
  const requests = await requestService.getSentRequests(query, userId);
  return sendSuccess(res, requests);
};

export const getReceivedRequests = async (req: Request, res: Response) => {
  const query = listRequestsQuerySchema.parse(req.query);
  const userId = req.user?.id;
  const requests = await requestService.getReceivedRequests(query, userId);
  return sendSuccess(res, requests);
};
