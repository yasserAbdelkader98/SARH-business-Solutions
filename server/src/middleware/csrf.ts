import type { RequestHandler } from "express";
import { config } from "../config.js";

export const requireTrustedOrigin: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  if (req.get("origin") !== config.APP_ORIGIN) {
    res.status(403).json({ error: "Untrusted request origin." });
    return;
  }
  next();
};
