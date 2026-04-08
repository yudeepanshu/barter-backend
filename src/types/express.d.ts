type AuthenticatedUser = {
  id: string;
  iat?: number;
  exp?: number;
};

declare namespace Express {
  interface Request {
    user?: AuthenticatedUser;
  }
}
