import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

export const config = z.object({
  MONGODB_URI: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535),
}).parse(process.env);
