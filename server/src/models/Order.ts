import { Schema, model } from "mongoose";

export const orderStatuses = [
  "pending",
  "processing",
  "completed",
  "cancelled",
] as const;

const itemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isSafeInteger,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    customerName: { type: String, required: true, trim: true },
    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: orderStatuses,
      required: true,
      default: "pending",
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isSafeInteger,
    },
    items: {
      type: [itemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length >= 1 && items.length <= 5,
        message: "Orders must have 1–5 line items.",
      },
    },
    idempotencyKey: { type: String, trim: true, minlength: 1 },
    requestHash: { type: String },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1, _id: -1 });
orderSchema.index({ totalAmount: -1, _id: -1 });
orderSchema.index({ status: 1, createdAt: -1, _id: -1 });
orderSchema.index({ status: 1, totalAmount: -1, _id: -1 });
orderSchema.index({ customerName: "text", customerEmail: "text" });
orderSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: "string" } },
  },
);

export const Order = model("Order", orderSchema);
