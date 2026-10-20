import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { createOrder, deleteOrder, listOrders } from "../controllers/orders.js";

export const ordersRouter = Router();
ordersRouter.use(requireAuth);
ordersRouter.get("/", listOrders);
ordersRouter.post("/", createOrder);
ordersRouter.delete("/:id", requireRole("admin"), deleteOrder);
