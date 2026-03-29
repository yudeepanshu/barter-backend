import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import * as requestService from './request.service';
import {
  cancelRequestSchema,
  createCounterOfferSchema,
  createRequestSchema,
  listRequestsQuerySchema,
  requestContactRevealSchema,
  respondContactRevealSchema,
  revealRequestIdParamSchema,
  requestIdParamSchema,
} from './request.schema';

export const createRequest = async (req: Request, res: Response) => {
  const payload = createRequestSchema.parse(req.body);
  const userId = req.user?.id;
  const result = await requestService.createRequest(payload, userId);
  return sendSuccess(res, result, 'Request created', 201);
};

export const getRequestById = async (req: Request, res: Response) => {
  const { id: requestId } = requestIdParamSchema.parse(req.params);
  const userId = req.user?.id;
  const request = await requestService.getRequestById(requestId, userId);
  return sendSuccess(res, request);
};

export const getRequestOffers = async (req: Request, res: Response) => {
  const { id: requestId } = requestIdParamSchema.parse(req.params);
  const userId = req.user?.id;
  const offers = await requestService.getRequestOffers(requestId, userId);
  return sendSuccess(res, offers);
};

export const createCounterOffer = async (req: Request, res: Response) => {
  const { id: requestId } = requestIdParamSchema.parse(req.params);
  const payload = createCounterOfferSchema.parse(req.body);
  const userId = req.user?.id;
  const result = await requestService.createCounterOffer(requestId, payload, userId);
  return sendSuccess(res, result, 'Counter offer created', 201);
};

export const acceptRequest = async (req: Request, res: Response) => {
  const { id: requestId } = requestIdParamSchema.parse(req.params);
  const userId = req.user?.id;
  const result = await requestService.acceptRequest(requestId, userId);
  return sendSuccess(res, result, 'Request accepted');
};

export const rejectRequest = async (req: Request, res: Response) => {
  const { id: requestId } = requestIdParamSchema.parse(req.params);
  const userId = req.user?.id;
  const result = await requestService.rejectRequest(requestId, userId);
  return sendSuccess(res, result, 'Request rejected');
};

export const cancelRequest = async (req: Request, res: Response) => {
  const { id: requestId } = requestIdParamSchema.parse(req.params);
  const payload = cancelRequestSchema.parse(req.body);
  const userId = req.user?.id;
  const result = await requestService.cancelRequest(requestId, payload, userId);
  return sendSuccess(res, result, 'Request cancelled');
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

export const requestContactReveal = async (req: Request, res: Response) => {
  const { id: requestId } = requestIdParamSchema.parse(req.params);
  const payload = requestContactRevealSchema.parse(req.body);
  const userId = req.user?.id;
  const result = await requestService.requestContactReveal(requestId, payload, userId);
  return sendSuccess(res, result, 'Contact reveal requested');
};

export const respondContactReveal = async (req: Request, res: Response) => {
  const { id: requestId } = requestIdParamSchema.parse(req.params);
  const { revealRequestId } = revealRequestIdParamSchema.parse(req.params);
  const payload = respondContactRevealSchema.parse(req.body);
  const userId = req.user?.id;
  const result = await requestService.respondContactReveal(
    requestId,
    revealRequestId,
    payload,
    userId,
  );
  return sendSuccess(
    res,
    result,
    payload.approve ? 'Contact reveal approved' : 'Contact reveal rejected',
  );
};
