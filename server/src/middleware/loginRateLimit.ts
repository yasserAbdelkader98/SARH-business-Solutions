import { rateLimit } from "express-rate-limit";
import { config } from "../config.js";

export const loginRateLimit = rateLimit({
  windowMs: config.LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: config.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});
