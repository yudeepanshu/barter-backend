import { Request, Response, NextFunction } from 'express';

/**
 * INPUT SANITIZATION MIDDLEWARE
 *
 * Runs once, globally, immediately after body-parsing in app.ts.
 * Every request body, query string, and URL param is cleaned before
 * it reaches a validator or controller.
 *
 * ─── THREE JOBS ──────────────────────────────────────────────────
 *
 * 1. NULL BYTE REMOVAL
 *    The character \x00 (null byte) is invisible in most logs but
 *    can truncate strings in C-based libraries, confuse DB drivers,
 *    and bypass pattern-matching checks.
 *    Example attack: username "admin\x00injected" might match "admin"
 *    in a strcmp-based check while storing "admin\x00injected" in DB.
 *    We strip \x00 from every string, everywhere.
 *
 * 2. RECURSIVE STRING TRIMMING
 *    We trim leading/trailing whitespace from every string value.
 *    This means whitespace-only inputs like "   " become "" and then
 *    fail Zod min-length checks — without needing .trim() on every
 *    individual schema field.
 *    Without this: { "title": "   " } would pass min(1) in Zod.
 *    With this:    { "title": "" }    correctly fails min(1).
 *
 * 3. HTTP PARAMETER POLLUTION (HPP) PREVENTION
 *    When the same query param appears multiple times, Express parses
 *    it into an array: ?role=user&role=admin → req.query.role = ['user','admin']
 *    A controller doing `if (req.query.role === 'user')` would match the
 *    first element ('user') even though 'admin' was also sent.
 *    We collapse duplicate scalar params to their LAST value (most explicit),
 *    so the unexpected array never reaches route logic.
 *    Intentional array params (those already parsed as objects, not strings)
 *    are left untouched.
 *
 * ─── WHAT THIS DOES NOT DO ───────────────────────────────────────
 *    - Does NOT escape HTML. That is an output concern (handled at the
 *      rendering layer). Escaping on input corrupts stored data and
 *      breaks context-specific encoding (JSON vs HTML vs SQL).
 *    - Does NOT validate data types or formats — that is Zod's job.
 *    - Does NOT remove unknown fields — that is Zod's job via .strict().
 * ─────────────────────────────────────────────────────────────────
 */

/**
 * Recursively clean a value:
 *   - strings → strip null bytes, trim whitespace
 *   - arrays  → clean each element
 *   - objects → clean each value (and also strip null bytes from key names)
 *   - other   → return as-is (numbers, booleans, null, undefined)
 */
function deepClean(value: unknown): unknown {
  if (typeof value === 'string') {
    // Strip null bytes first, then trim surrounding whitespace.
    // Order matters: "  \x00hello\x00  " → "  hello  " → "hello"
    return value.replace(/\0/g, '').trim();
  }

  if (Array.isArray(value)) {
    return value.map(deepClean);
  }

  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      // Strip null bytes from key names too — prevents key confusion attacks
      const safeKey = key.replace(/\0/g, '');
      cleaned[safeKey] = deepClean((value as Record<string, unknown>)[key]);
    }
    return cleaned;
  }

  return value;
}

/**
 * HTTP Parameter Pollution collapse.
 *
 * After deepClean, query values may still be arrays if the client sent
 * the same param multiple times. For params where all elements are
 * strings (i.e., not intentionally complex objects), collapse to last value.
 *
 * Example:
 *   ?status=ACTIVE&status=REMOVED  →  { status: 'REMOVED' }  (last wins)
 *   ?ids[]=a&ids[]=b               →  left alone (elements are objects in qs)
 */
function collapseHpp(query: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(query)) {
    const val = query[key];
    if (Array.isArray(val) && val.every((v) => typeof v === 'string')) {
      // All elements are plain strings → attacker sent the same param twice
      // Take the last-specified value (most explicit intent)
      result[key] = val[val.length - 1];
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Express middleware. Wire after body-parsing, before validators/routes.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  // 1 & 2: null-byte removal + trimming
  if (req.body && typeof req.body === 'object') {
    req.body = deepClean(req.body);
  }

  // 1, 2 & 3: clean query string, then collapse HPP
  if (req.query && typeof req.query === 'object') {
    const cleaned = deepClean(req.query) as Record<string, unknown>;
    Object.defineProperty(req, 'query', {
      value: collapseHpp(cleaned) as typeof req.query,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  // 1 & 2: clean URL params (already tokenised by Express router)
  if (req.params && typeof req.params === 'object') {
    req.params = deepClean(req.params) as typeof req.params;
  }

  next();
}
