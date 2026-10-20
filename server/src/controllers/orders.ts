import { createHash } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import {
  createOrderSchema,
  idempotencyKeySchema,
  listQuerySchema,
} from "../validation/Orders.js";
import type { RequestHandler } from "express";
import { Order } from "../models/Order.js";

export const listOrders: RequestHandler = async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid orders query parameters." });
    return;
  }

  const { search, status, sortBy, sortOrder, page } = parsed.data;
  const filter: {
    status?: "pending" | "processing" | "completed" | "cancelled";
    customerEmail?: string;
    $text?: { $search: string };
  } = {};
  if (status) filter.status = status;
  if (search) {
    if (search.includes("@")) filter.customerEmail = search.toLowerCase();
    else {
      const phrase = search.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
      filter.$text = { $search: `"${phrase}"` };
    }
  }
  const direction = sortOrder === "asc" ? 1 : -1;
  const pageSize = 25;
  const count = Order.countDocuments(filter).maxTimeMS(5000);
  if (!search && !status) count.hint({ _id: 1 });
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select("customerName customerEmail status totalAmount createdAt")
      .sort({ [sortBy]: direction, _id: direction })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean()
      .maxTimeMS(5000),
    count,
  ]);
  res.set("Cache-Control", "no-store");
  res.json({
    orders,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
};

export const deleteOrder: RequestHandler = async (req, res) => {
  if (
    typeof req.params.id !== "string" ||
    !/^[a-f\d]{24}$/i.test(req.params.id)
  ) {
    res.status(400).json({ error: "Invalid order ID." });
    return;
  }
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.status(204).end();
};

export const createOrder: RequestHandler = async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  const key = idempotencyKeySchema.safeParse(req.get("Idempotency-Key"));
  if (!parsed.success || !key.success) {
    res.status(400).json({
      error:
        "Provide a UUID Idempotency-Key, a customer and 1–5 valid items. Prices must be integer cents.",
    });
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const { customerName, customerEmail, items } = parsed.data;
  // Explicit field order makes property order in the incoming JSON irrelevant.
  const canonical = {
    userId: req.user.id,
    customerName,
    customerEmail,
    items: items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
  const requestHash = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
  const totalAmount = items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0,
  );
  res.set("Cache-Control", "no-store");
  try {
    const order = await Order.create({
      customerName,
      customerEmail,
      items,
      totalAmount,
      status: "pending",
      idempotencyKey: key.data,
      requestHash,
    });
    res.status(201).json({ order });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === 11000))
      throw error;
    // Never attempt a second insert here. The winning insert owns this key.
    for (let attempt = 0; attempt < 5; attempt++) {
      const order = await Order.findOne({ idempotencyKey: key.data })
        .read("primary")
        .lean();
      if (order) {
        if (order.requestHash !== requestHash) {
          res.status(409).json({
            error:
              "This idempotency key was already used for a different order.",
          });
          return;
        }
        res.status(200).json({ order });
        return;
      }
      await setTimeout(50);
    }
    res.set("Retry-After", "1");
    res.status(503).json({
      error:
        "Original order is not yet available. Retry the same request with the same key.",
    });
  }
};
