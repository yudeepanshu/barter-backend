import { ZodType } from 'zod';
import { Request, Response, NextFunction } from 'express';

/**
 * Validate req.body against a Zod schema.
 *
 * Why: Zod rejects unknown fields, coerces types (e.g., "3" → 3 for z.coerce.number()),
 * and returns clear error messages. Replacing req.body with the parsed result means
 * downstream controllers always receive data in exactly the expected shape — no extra
 * fields that could sneak in unexpected behaviour.
 */
export const validate =
  (schema: ZodType<any>) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: any) {
      next(err);
    }
  };

/**
 * Validate URL parameters (req.params) against a Zod schema.
 *
 * Why: Without this, a route like GET /products/:id sends the raw string from the URL
 * directly to the database query — anything from "" to "../../etc/passwd" to a 10KB
 * string. Validating params (usually checking UUID format) means malformed IDs are
 * rejected at the middleware layer, before any DB round-trip happens.
 *
 * Usage:  router.get('/:id', validateParams(productIdParamSchema), handler)
 */
export const validateParams =
  (schema: ZodType<any>) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err: any) {
      next(err);
    }
  };

/**
 * Validate query string (req.query) against a Zod schema.
 *
 * Why: Query strings are always strings from the HTTP layer. Zod's z.coerce.number()
 * converts "20" → 20 and rejects "abc". Without this, controllers have to manually
 * coerce and validate — or silently pass NaN to a LIMIT clause, causing errors.
 * Centralising query validation here also stops parameter injection via unexpected keys.
 *
 * Usage:  router.get('/', validateQuery(queryProductsSchema), handler)
 */
export const validateQuery =
  (schema: ZodType<any>) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      Object.defineProperty(req, 'query', {
        value: schema.parse(req.query),
        writable: true,
        enumerable: true,
        configurable: true,
      });
      next();
    } catch (err: any) {
      next(err);
    }
  };
