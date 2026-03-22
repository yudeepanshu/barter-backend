export const asyncHandler = (fn: any) => (req: any, res: any, next: any) =>
  fn(req, res, next).catch(next);
