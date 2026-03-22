import { ZodType } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const validate =
  (schema: ZodType<any>) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: any) {
      next(err);
    }
  };
