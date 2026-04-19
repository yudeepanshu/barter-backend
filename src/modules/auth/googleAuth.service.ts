import { AppError } from '../../common/errors/AppError';
import { API_ERROR_CODES } from '../../common/constants/apiResponses';
import { config } from '../../config/env';

type GoogleTokenInfoResponse = {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  sub?: string;
  name?: string;
  picture?: string;
  exp?: string;
};

export type GoogleIdentity = {
  providerUserId: string;
  email: string;
  name?: string;
  profilePicture?: string;
};

const GOOGLE_TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';

const isEmailVerified = (value: string | boolean | undefined): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  return value === 'true';
};

const ensureGoogleAuthEnabled = () => {
  if (!config.GOOGLE_AUTH_ENABLED) {
    throw new AppError(API_ERROR_CODES.GOOGLE_AUTH_DISABLED, 503);
  }
};

const ensureGoogleClientIdsConfigured = () => {
  if (config.GOOGLE_AUTH_CLIENT_IDS.length === 0) {
    throw new AppError(API_ERROR_CODES.GOOGLE_AUTH_NOT_CONFIGURED, 503);
  }
};

const assertAudienceIsAllowed = (audience: string) => {
  if (!config.GOOGLE_AUTH_CLIENT_IDS.includes(audience)) {
    throw new AppError(API_ERROR_CODES.INVALID_GOOGLE_TOKEN, 401);
  }
};

const fetchTokenInfo = async (idToken: string): Promise<GoogleTokenInfoResponse> => {
  const url = `${GOOGLE_TOKENINFO_ENDPOINT}?id_token=${encodeURIComponent(idToken)}`;

  let response: Response;

  try {
    response = await fetch(url);
  } catch {
    throw new AppError(API_ERROR_CODES.INVALID_GOOGLE_TOKEN, 401);
  }

  if (!response.ok) {
    throw new AppError(API_ERROR_CODES.INVALID_GOOGLE_TOKEN, 401);
  }

  return (await response.json()) as GoogleTokenInfoResponse;
};

export const verifyGoogleIdToken = async (idToken: string): Promise<GoogleIdentity> => {
  ensureGoogleAuthEnabled();
  ensureGoogleClientIdsConfigured();

  const tokenInfo = await fetchTokenInfo(idToken);

  if (!tokenInfo.aud || !tokenInfo.email || !tokenInfo.sub) {
    throw new AppError(API_ERROR_CODES.INVALID_GOOGLE_TOKEN, 401);
  }

  assertAudienceIsAllowed(tokenInfo.aud);

  if (!isEmailVerified(tokenInfo.email_verified)) {
    throw new AppError(API_ERROR_CODES.INVALID_GOOGLE_TOKEN, 401);
  }

  return {
    providerUserId: tokenInfo.sub,
    email: tokenInfo.email.toLowerCase().trim(),
    name: tokenInfo.name,
    profilePicture: tokenInfo.picture,
  };
};
