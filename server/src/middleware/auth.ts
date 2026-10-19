import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { User } from "../models/User.js";

const tokenSchema = z.object({
  sub: z.string().regex(/^[a-f\d]{24}$/i),
  role: z.enum(["admin", "agent"]),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

export type AuthUser = { id: string; role: "admin" | "agent" };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get("authorization") ?? "");
  if (!match) {
    res.status(401).json({ error: "A Bearer access token is required." });
    return;
  }

  let payload: z.infer<typeof tokenSchema>;
  try {
    payload = tokenSchema.parse(
      jwt.verify(match[1], config.JWT_SECRET, { algorithms: ["HS256"] }),
    );
  } catch {
    res.status(401).json({ error: "Invalid or expired access token." });
    return;
  }

  const user = await User.findById(payload.sub);
  if (!user || (user.role !== "admin" && user.role !== "agent")) {
    res.status(401).json({ error: "User is no longer available." });
    return;
  }
  req.user = { id: user.id, role: user.role };
  next();
};

export function requireRole(role: AuthUser["role"]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (req.user.role !== role) {
      res
        .status(403)
        .json({ error: "You do not have permission for this action." });
      return;
    }
    next();
  };
}
