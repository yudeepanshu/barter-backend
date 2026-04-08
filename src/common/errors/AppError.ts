import { API_ERROR_CODES, ApiErrorCode, resolveApiMessage } from '../constants/apiResponses';

export class AppError extends Error {
  status: number;
  code?: ApiErrorCode;

  constructor(
    codeOrMessage: ApiErrorCode | string = API_ERROR_CODES.INTERNAL_SERVER_ERROR,
    status = 500,
  ) {
    const resolved = resolveApiMessage(codeOrMessage);
    super(resolved.message);
    this.status = status;
    this.code = resolved.code as ApiErrorCode | undefined;
  }
}
