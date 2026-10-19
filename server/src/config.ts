import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

export const config = z
  .object({
    MONGODB_URI: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65535),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().min(1).max(86400),
    LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  })
  .parse(process.env);
