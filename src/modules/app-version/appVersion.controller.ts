import { Request, Response } from 'express';
import { sendSuccess } from '../../common/utils/responseHandler';
import { getAppVersionPolicy, uploadAppVersionPolicyToS3 } from './appVersion.service';
import {
  getAppVersionPolicyQuerySchema,
  upsertAppVersionPolicyBodySchema,
} from './appVersion.schema';

export const getVersionPolicy = async (req: Request, res: Response) => {
  const query = getAppVersionPolicyQuerySchema.parse(req.query);
  const policy = await getAppVersionPolicy({
    platform: query.platform,
    currentVersion: query.currentVersion,
  });

  return sendSuccess(res, policy);
};

export const uploadVersionPolicy = async (req: Request, res: Response) => {
  const payload = upsertAppVersionPolicyBodySchema.parse(req.body);
  const result = await uploadAppVersionPolicyToS3(payload);

  return sendSuccess(
    res,
    {
      policyUrl: result.policyUrl,
      bucket: result.bucket,
      key: result.key,
      policy: result.policy,
    },
    'App version policy uploaded',
  );
};
