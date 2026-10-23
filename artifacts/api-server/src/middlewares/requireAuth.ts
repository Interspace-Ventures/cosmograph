import type { Request, Response, NextFunction } from "express";
import { getExoIdentity, type ExoIdentity } from "./exoIdentity";
import { recordAccount } from "../lib/account";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The verified Exo subject (JWT `sub`); the account key everywhere. */
      userId?: string;
      exoIdentity?: ExoIdentity;
    }
  }
}

// Gate a route behind a verified Exo ID access token (Bearer or the
// `exo_access` cookie; see exoIdentity.ts). There is no bypass: no header,
// query flag, or environment switch lets an unauthenticated request through.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const identity = await getExoIdentity(req);
  if (!identity) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    await recordAccount(identity);
  } catch (err) {
    req.log.error({ err }, "account record failed");
    res.status(503).json({ error: "Account service unavailable" });
    return;
  }
  req.userId = identity.subject;
  req.exoIdentity = identity;
  next();
}
