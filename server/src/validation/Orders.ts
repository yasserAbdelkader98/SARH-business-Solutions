import { z } from "zod";
import { orderStatuses } from "../models/Order.js";

export const createOrderSchema = z
  .object({
    customerName: z.string().trim().min(1).max(200),
    customerEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            quantity: z.number().int().min(1).max(10000),
            unitPrice: z.number().int().min(0).max(100000000),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();

export const idempotencyKeySchema = z
  .uuid()
  .transform((value) => value.toLowerCase());

export const listQuerySchema = z
  .object({
    search: z.string().trim().max(100).default(""),
    status: z.enum(orderStatuses).optional(),
    sortBy: z.enum(["createdAt", "totalAmount"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    page: z
      .string()
      .regex(/^[1-9]\d*$/)
      .default("1")
      .transform(Number)
      .pipe(z.number().int().max(1000000)),
  })
  .strict();
