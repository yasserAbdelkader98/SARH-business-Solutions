import type { RequestHandler } from "express";
import { Order } from "../models/Order.js";

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
