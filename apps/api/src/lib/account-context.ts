import type { Request, Response, NextFunction } from "express";
import { z } from "zod";

const accountIdSchema = z.string().min(1);

// extends express's Request type so req.accountId is visible and typed
// everywhere downstream, not just in this file
declare global {
  namespace Express {
    interface Request {
      accountId: string;
    }
  }
}

// reads x-account-id off every request. doesn't verify the account exists -
// that's each route's own job, since "missing header" and "header doesn't
// match a real account" are different failures with different status codes.
export function requireAccountHeader(req: Request, _res: Response, next: NextFunction) {
  req.accountId = accountIdSchema.parse(req.headers["x-account-id"]);
  next();
}