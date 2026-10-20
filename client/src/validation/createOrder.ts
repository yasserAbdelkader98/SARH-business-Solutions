import { z } from "zod";

const itemSchema = z.object({
  name: z.string().trim().min(1, "Enter an item name.").max(120),
  quantity: z.number().int().min(1).max(10000),
  unitPrice: z.number().int().min(0).max(100000000),
});

export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1, "Enter a customer name.").max(200),
  customerEmail: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  items: z.array(itemSchema).min(1).max(5),
});

export const priceSchema = z
  .string()
  .regex(
    /^\d{1,7}(\.\d{1,2})?$/,
    "Enter a price with at most two decimal places.",
  )
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  })
  .pipe(z.number().max(100000000));

export const formSchema = createOrderSchema.extend({
  items: z
    .array(
      itemSchema.extend({
        quantity: z
          .string()
          .regex(/^\d+$/, "Quantity must be a whole number.")
          .transform(Number)
          .pipe(itemSchema.shape.quantity),
        unitPrice: priceSchema,
      }),
    )
    .min(1)
    .max(5),
});

export const operationSchema = z.object({
  key: z.uuid(),
  payload: createOrderSchema,
  orderId: z.string().optional(),
});
export type CreateOperation = z.infer<typeof operationSchema>;
